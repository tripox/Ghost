import Service, {inject as service} from '@ember/service';
import fetch from 'fetch';
import validator from 'validator';
import {inject} from 'ghost-admin/decorators/inject';

export default class FrontendService extends Service {
    @service settings;
    @service ajax;

    @inject config;

    _hasLoggedIn = false;
    _lastPassword = null;

    get hasPasswordChanged() {
        return this._lastPassword !== this.settings.password;
    }

    get isSameOrigin() {
        return new URL(this.config.blogUrl).origin === window.location.origin;
    }

    getUrl(path) {
        const siteUrl = new URL(this.config.blogUrl);
        const subdir = siteUrl.pathname.endsWith('/') ? siteUrl.pathname : `${siteUrl.pathname}/`;
        const fullPath = `${subdir}${path.replace(/^\//, '')}`;

        return `${siteUrl.origin}${fullPath}`;
    }

    async loginIfNeeded() {
        if (this.settings.isPrivate && (this.hasPasswordChanged || !this._hasLoggedIn)) {
            const privateLoginUrl = this.getUrl('/private/?r=%2F');
            this._lastPassword = this.settings.password;

            // Browsers cannot set the frontend's private-site cookie from a
            // cross-origin Admin request. Avoid a request that is guaranteed
            // to fail CORS and let the frontend handle its own authentication.
            if (!this.isSameOrigin) {
                this._hasLoggedIn = true;
                return;
            }

            return fetch(privateLoginUrl, {
                method: 'POST',
                mode: 'cors',
                redirect: 'manual',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: `password=${this._lastPassword}`
            }).then(() => {
                this._hasLoggedIn = true;
            }).catch(() => {
                // Private-site login is best-effort and should not block Admin.
                this._hasLoggedIn = true;
            });
        }
    }

    async fetch(urlOrPath, options) {
        await this.loginIfNeeded();
        let frontendUrl = urlOrPath;
        if (!validator.isURL(urlOrPath)) {
            frontendUrl = this.getUrl(urlOrPath);
        }
        return fetch(frontendUrl, {
            mode: 'cors',
            credentials: 'include',
            ...options
        });
    }
}
