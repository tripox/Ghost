const assert = require('node:assert/strict');
const sinon = require('sinon');
const PasskeyService = require('../../../../../core/server/services/passkeys/passkey-service');
const models = require('../../../../../core/server/models');

describe('PasskeyService', function () {
  let clock;
  let service;

  beforeEach(function () {
    clock = sinon.useFakeTimers({ now: new Date('2026-08-25T12:00:00Z') });
    service = new PasskeyService({
      getSecret: () => 'test-secret',
      getSiteTitle: () => 'Test site',
    });
  });

  afterEach(function () {
    sinon.restore();
  });

  it('creates a short-lived ceremony token bound to its purpose and subject', function () {
    const token = service.createCeremonyToken({
      challenge: 'challenge',
      purpose: 'member-registration',
      subjectId: 'member-id',
    });

    const ceremony = service.verifyCeremonyToken(token, {
      purpose: 'member-registration',
      subjectId: 'member-id',
    });

    assert.equal(ceremony.challenge, 'challenge');
    assert.equal(ceremony.issued, clock.now);
    assert.equal(ceremony.expires, clock.now + 5 * 60 * 1000);
  });

  it('rejects tampered, mismatched and expired ceremony tokens', function () {
    const token = service.createCeremonyToken({
      challenge: 'challenge',
      purpose: 'member-registration',
      subjectId: 'member-id',
    });

    assert.equal(
      service.verifyCeremonyToken(`${token}tampered`, {
        purpose: 'member-registration',
        subjectId: 'member-id',
      }),
      null,
    );
    assert.equal(
      service.verifyCeremonyToken(token, {
        purpose: 'member-authentication',
        subjectId: 'member-id',
      }),
      null,
    );
    assert.equal(
      service.verifyCeremonyToken(token, {
        purpose: 'member-registration',
        subjectId: 'another-member',
      }),
      null,
    );

    clock.tick(5 * 60 * 1000 + 1);
    assert.equal(
      service.verifyCeremonyToken(token, {
        purpose: 'member-registration',
        subjectId: 'member-id',
      }),
      null,
    );
  });

  it('excludes credentials already registered to the account', async function () {
    const generateRegistrationOptions = sinon.stub().resolves({ challenge: 'challenge' });
    sinon.stub(service, 'webAuthn').resolves({ generateRegistrationOptions });
    sinon.stub(service, 'credentialsFor').resolves({
      models: [
        {
          get: sinon.stub().callsFake((key) => {
            return {
              credential_id: 'existing-credential',
              transports: '["internal"]',
            }[key];
          }),
        },
      ],
    });

    await service.registrationOptions({
      memberId: 'member-id',
      email: 'member@example.com',
      name: 'Member',
      origin: 'https://example.com',
    });

    sinon.assert.calledWithMatch(generateRegistrationOptions, {
      excludeCredentials: [{ id: 'existing-credential', transports: ['internal'] }],
    });
  });

  it('returns a conflict when a duplicate credential reaches persistence', async function () {
    sinon.stub(service, 'webAuthn').resolves({
      verifyRegistrationResponse: sinon.stub().resolves({
        verified: true,
        registrationInfo: {
          credential: {
            id: 'existing-credential',
            publicKey: Buffer.from('public-key'),
            counter: 0,
          },
          credentialBackedUp: true,
          credentialDeviceType: 'multiDevice',
        },
      }),
    });
    sinon.stub(models.PasskeyCredential, 'add').rejects({ code: 'ER_DUP_ENTRY' });

    await assert.rejects(
      service.register({
        memberId: 'member-id',
        origin: 'https://example.com',
        expectedChallenge: 'challenge',
        response: {},
        name: 'Duplicate',
      }),
      /This passkey is already registered/,
    );
  });
});
