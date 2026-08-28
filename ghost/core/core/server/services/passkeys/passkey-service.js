const crypto = require('node:crypto');
const errors = require('@tryghost/errors');
const models = require('../../models');
const db = require('../../data/db');

const CEREMONY_TTL_MS = 5 * 60 * 1000;

function credentialHash(credentialId) {
  return crypto.createHash('sha256').update(credentialId).digest('hex');
}

function isDuplicateCredentialError(error) {
  return error?.code === 'ER_DUP_ENTRY' || error?.code?.startsWith?.('SQLITE_CONSTRAINT');
}

function decodeTransports(value) {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return undefined;
  }
}

function publicCredential(model) {
  return {
    id: model.id,
    name: model.get('name'),
    created_at: model.get('created_at'),
    last_used_at: model.get('last_used_at'),
    device_type: model.get('device_type'),
    backed_up: model.get('backed_up'),
  };
}

class PasskeyService {
  constructor({ getSecret, getSiteTitle }) {
    this.getSecret = getSecret;
    this.getSiteTitle = getSiteTitle;
  }

  async webAuthn() {
    return import('@simplewebauthn/server');
  }

  relyingParty(origin) {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
      throw new errors.IncorrectUsageError({ message: 'Passkeys require HTTPS outside localhost' });
    }

    return {
      origin: parsed.origin,
      rpID: parsed.hostname,
      rpName: this.getSiteTitle() || 'Ghost',
    };
  }

  async credentialsFor({ userId, memberId, rpID }) {
    const where = userId ? { user_id: userId, rp_id: rpID } : { member_id: memberId, rp_id: rpID };
    return models.PasskeyCredentials.forge().query('where', where).fetch();
  }

  async list(options) {
    const credentials = await this.credentialsFor(options);
    return credentials.models.map(publicCredential);
  }

  async hasCredentials(options) {
    const credentials = await this.credentialsFor(options);
    return credentials.length > 0;
  }

  async registrationOptions({ userId, memberId, email, name, origin }) {
    const { generateRegistrationOptions } = await this.webAuthn();
    const rp = this.relyingParty(origin);
    const credentials = await this.credentialsFor({ userId, memberId, rpID: rp.rpID });
    const subjectId = userId || memberId;
    const options = await generateRegistrationOptions({
      rpName: rp.rpName,
      rpID: rp.rpID,
      userID: new TextEncoder().encode(subjectId),
      userName: email,
      userDisplayName: name || email,
      attestationType: 'none',
      excludeCredentials: credentials.models.map((credential) => ({
        id: credential.get('credential_id'),
        transports: decodeTransports(credential.get('transports')),
      })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
    });

    return { options, rp };
  }

  async register({ userId, memberId, origin, expectedChallenge, response, name }) {
    const { verifyRegistrationResponse } = await this.webAuthn();
    const rp = this.relyingParty(origin);
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return null;
    }

    const { credential, credentialBackedUp, credentialDeviceType } = verification.registrationInfo;
    let model;
    try {
      model = await models.PasskeyCredential.add({
        user_id: userId || null,
        member_id: memberId || null,
        credential_id: credential.id,
        credential_id_hash: credentialHash(credential.id),
        rp_id: rp.rpID,
        public_key: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        transports: credential.transports ? JSON.stringify(credential.transports) : null,
        device_type: credentialDeviceType,
        backed_up: credentialBackedUp,
        name:
          String(name || 'Passkey')
            .trim()
            .slice(0, 191) || 'Passkey',
      });
    } catch (error) {
      if (isDuplicateCredentialError(error)) {
        throw new errors.ConflictError({ message: 'This passkey is already registered.' });
      }
      throw error;
    }

    return publicCredential(model);
  }

  async authenticationOptions({ userId, origin }) {
    const { generateAuthenticationOptions } = await this.webAuthn();
    const rp = this.relyingParty(origin);
    const credentials = userId ? await this.credentialsFor({ userId, rpID: rp.rpID }) : null;
    const options = await generateAuthenticationOptions({
      rpID: rp.rpID,
      userVerification: 'required',
      ...(credentials
        ? {
            allowCredentials: credentials.models.map((credential) => ({
              id: credential.get('credential_id'),
              transports: decodeTransports(credential.get('transports')),
            })),
          }
        : {}),
    });

    return { options, rp };
  }

  async authenticate({ origin, expectedChallenge, response, audience, ceremonyIssuedAt }) {
    if (!response || typeof response.id !== 'string' || !response.id) {
      return null;
    }
    const credential = await models.PasskeyCredential.findOne({
      credential_id_hash: credentialHash(response.id),
    });
    if (!credential) {
      return null;
    }

    const rp = this.relyingParty(origin);
    if (credential.get('rp_id') !== rp.rpID) {
      return null;
    }
    if (audience === 'staff' && !credential.get('user_id')) {
      return null;
    }
    if (audience === 'member' && !credential.get('member_id')) {
      return null;
    }

    const { verifyAuthenticationResponse } = await this.webAuthn();
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: {
        id: credential.get('credential_id'),
        publicKey: Buffer.from(credential.get('public_key'), 'base64url'),
        counter: Number(credential.get('counter')),
        transports: decodeTransports(credential.get('transports')),
      },
      requireUserVerification: true,
    });

    if (!verification.verified) {
      return null;
    }

    const update = {
      counter: verification.authenticationInfo.newCounter,
      last_used_at: new Date(),
      updated_at: new Date(),
      backed_up: verification.authenticationInfo.credentialBackedUp,
      device_type: verification.authenticationInfo.credentialDeviceType,
    };

    if (ceremonyIssuedAt) {
      const updated = await db
        .knex('passkey_credentials')
        .where({ id: credential.id })
        .where((builder) => {
          builder
            .whereNull('last_used_at')
            .orWhere('last_used_at', '<', new Date(ceremonyIssuedAt));
        })
        .update(update);
      if (updated !== 1) {
        return null;
      }
    } else {
      await models.PasskeyCredential.edit(update, { id: credential.id });
    }

    return {
      userId: credential.get('user_id'),
      memberId: credential.get('member_id'),
      credential: publicCredential(credential),
    };
  }

  async remove({ id, userId, memberId, rpID }) {
    const credential = await models.PasskeyCredential.findOne({ id });
    const ownsCredential =
      credential &&
      credential.get('rp_id') === rpID &&
      ((userId && credential.get('user_id') === userId) ||
        (memberId && credential.get('member_id') === memberId));

    if (!ownsCredential) {
      return false;
    }

    await models.PasskeyCredential.destroy({ id });
    return true;
  }

  createCeremonyToken({ challenge, purpose, subjectId }) {
    const issued = Date.now();
    const payload = Buffer.from(
      JSON.stringify({
        challenge,
        purpose,
        subjectId: subjectId || null,
        issued,
        expires: issued + CEREMONY_TTL_MS,
      }),
    ).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.getSecret())
      .update(payload)
      .digest('base64url');
    return `${payload}.${signature}`;
  }

  verifyCeremonyToken(token, { purpose, subjectId }) {
    const [payload, signature] = String(token || '').split('.');
    if (!payload || !signature) {
      return null;
    }
    const expected = crypto
      .createHmac('sha256', this.getSecret())
      .update(payload)
      .digest('base64url');
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      return null;
    }

    let ceremony;
    try {
      ceremony = JSON.parse(Buffer.from(payload, 'base64url').toString());
    } catch (error) {
      return null;
    }
    if (
      ceremony.purpose !== purpose ||
      !Number.isSafeInteger(ceremony.issued) ||
      !Number.isSafeInteger(ceremony.expires) ||
      ceremony.expires <= ceremony.issued ||
      ceremony.expires < Date.now() ||
      (subjectId && ceremony.subjectId !== subjectId)
    ) {
      return null;
    }
    return ceremony;
  }
}

module.exports = PasskeyService;
