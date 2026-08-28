const errors = require('@tryghost/errors');
const models = require('../../models');
const membersService = require('../members');
const passkeys = require('./index');
const urlUtils = require('../../../shared/url-utils').default;

function memberOrigin() {
  return new URL(urlUtils.getSiteUrl()).origin;
}

async function authenticatedMember(req, res) {
  let member;
  try {
    member = await membersService.ssr.getMemberDataFromSession(req, res);
  } catch {
    throw new errors.UnauthorizedError({ message: 'Member sign-in required.' });
  }
  if (!member) {
    throw new errors.UnauthorizedError({ message: 'Member sign-in required.' });
  }
  return member;
}

module.exports = {
  async list(req, res, next) {
    try {
      const member = await authenticatedMember(req, res);
      const origin = memberOrigin();
      const credentials = await passkeys.list({
        memberId: member.id,
        rpID: new URL(origin).hostname,
      });
      res.json({ passkeys: credentials });
    } catch (error) {
      next(error);
    }
  },

  async beginRegistration(req, res, next) {
    try {
      const member = await authenticatedMember(req, res);
      const origin = memberOrigin();
      const { options } = await passkeys.registrationOptions({
        memberId: member.id,
        email: member.email,
        name: member.name,
        origin,
      });
      const ceremony = passkeys.createCeremonyToken({
        challenge: options.challenge,
        purpose: 'member-registration',
        subjectId: member.id,
      });
      res.json({ options, ceremony });
    } catch (error) {
      next(error);
    }
  },

  async finishRegistration(req, res, next) {
    try {
      const member = await authenticatedMember(req, res);
      const ceremony = passkeys.verifyCeremonyToken(req.body.ceremony, {
        purpose: 'member-registration',
        subjectId: member.id,
      });
      if (!ceremony) {
        throw new errors.BadRequestError({ message: 'Passkey registration challenge expired.' });
      }
      const credential = await passkeys.register({
        memberId: member.id,
        origin: memberOrigin(),
        expectedChallenge: ceremony.challenge,
        response: req.body.response,
        name: req.body.name,
      });
      if (!credential) {
        throw new errors.BadRequestError({ message: 'Passkey registration failed.' });
      }
      res.status(201).json({ passkeys: [credential] });
    } catch (error) {
      next(error);
    }
  },

  async remove(req, res, next) {
    try {
      const member = await authenticatedMember(req, res);
      const origin = memberOrigin();
      const removed = await passkeys.remove({
        id: req.params.id,
        memberId: member.id,
        rpID: new URL(origin).hostname,
      });
      if (!removed) {
        throw new errors.NotFoundError({ message: 'Passkey not found.' });
      }
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  },

  async beginAuthentication(req, res, next) {
    try {
      const { options } = await passkeys.authenticationOptions({ origin: memberOrigin() });
      const ceremony = passkeys.createCeremonyToken({
        challenge: options.challenge,
        purpose: 'member-authentication',
      });
      res.json({ options, ceremony });
    } catch (error) {
      next(error);
    }
  },

  async finishAuthentication(req, res, next) {
    try {
      const ceremony = passkeys.verifyCeremonyToken(req.body.ceremony, {
        purpose: 'member-authentication',
      });
      if (!ceremony) {
        throw new errors.UnauthorizedError({
          message: 'Passkey authentication challenge expired.',
        });
      }
      const result = await passkeys.authenticate({
        origin: memberOrigin(),
        expectedChallenge: ceremony.challenge,
        response: req.body.response,
        audience: 'member',
        ceremonyIssuedAt: ceremony.issued,
      });
      if (!result?.memberId) {
        throw new errors.UnauthorizedError({ message: 'Passkey authentication failed.' });
      }
      const member = await models.Member.findOne({ id: result.memberId });
      if (!member) {
        throw new errors.UnauthorizedError({ message: 'Passkey authentication failed.' });
      }
      await membersService.ssr.createSessionForMember(req, res, member.toJSON());
      await models.MemberLoginEvent.add({ member_id: member.id });
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  },
};
