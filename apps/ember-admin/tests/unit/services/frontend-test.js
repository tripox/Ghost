import sinon from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';
import {setupTest} from 'ember-mocha';

describe('Unit: Service: frontend', function () {
    setupTest();

    let service;

    beforeEach(function () {
        service = this.owner.lookup('service:frontend');
        service.settings.isPrivate = true;
        service.settings.password = 'secret';
    });

    afterEach(function () {
        sinon.restore();
    });

    it('skips private-site login when Admin and the frontend have different origins', async function () {
        sinon.stub(service, 'isSameOrigin').get(() => false);

        await service.loginIfNeeded();

        expect(service._lastPassword).to.equal('secret');
        expect(service._hasLoggedIn).to.be.true;
    });
});
