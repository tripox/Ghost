import React from 'react';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import AppContext from '../../app-context';
import ActionButton from '../common/action-button';
import BackButton from '../common/back-button';
import CloseButton from '../common/close-button';
import InputForm from '../common/input-form';
import { t } from '../../utils/i18n';

export default class AccountPasskeysPage extends React.Component {
  static contextType = AppContext;

  constructor(props, context) {
    super(props, context);
    this.state = {
      passkeys: [],
      passkeysAvailable: browserSupportsWebAuthn(),
      passkeyBusy: false,
      passkeyError: '',
      passkeyName: '',
    };
  }

  componentDidMount() {
    if (!this.context.member) {
      this.context.doAction('switchPage', { page: 'signin' });
      return;
    }
    if (this.state.passkeysAvailable) {
      this.context.api.member
        .passkeys()
        .then(({ passkeys }) => this.setState({ passkeys }))
        .catch(() => undefined);
    }
  }

  async addPasskey() {
    const name = this.state.passkeyName.trim();
    if (!name) {
      return;
    }
    this.setState({ passkeyBusy: true, passkeyError: '' });
    try {
      const beginIntegrityToken = await this.context.api.member.getIntegrityToken();
      const { options, ceremony } = await this.context.api.member.beginPasskeyRegistration({
        integrityToken: beginIntegrityToken,
      });
      const response = await startRegistration({ optionsJSON: options });
      const finishIntegrityToken = await this.context.api.member.getIntegrityToken();
      const result = await this.context.api.member.finishPasskeyRegistration({
        response,
        ceremony,
        integrityToken: finishIntegrityToken,
        name,
      });
      this.setState((state) => ({
        passkeys: [...state.passkeys, ...result.passkeys],
        passkeyName: '',
      }));
    } catch (error) {
      if (
        error?.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' ||
        error?.message === 'This passkey is already registered.'
      ) {
        this.setState({ passkeyError: t('This passkey is already registered.') });
      } else if (error?.name !== 'NotAllowedError' && error?.code !== 'ERROR_CEREMONY_ABORTED') {
        this.setState({ passkeyError: t('Unable to add passkey. Please try again.') });
      }
    } finally {
      this.setState({ passkeyBusy: false });
    }
  }

  async removePasskey(id) {
    this.setState({ passkeyBusy: true });
    try {
      const integrityToken = await this.context.api.member.getIntegrityToken();
      await this.context.api.member.removePasskey(id, integrityToken);
      this.setState((state) => ({
        passkeys: state.passkeys.filter((passkey) => passkey.id !== id),
      }));
    } finally {
      this.setState({ passkeyBusy: false });
    }
  }

  formatPasskeyCreatedAt(createdAt) {
    if (!createdAt) {
      return null;
    }
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    const formattedDate = new Intl.DateTimeFormat(this.context.locale || undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
    return t('Added {date}', { date: formattedDate });
  }

  renderHeader() {
    return (
      <header className="gh-portal-detail-header">
        <BackButton
          brandColor={this.context.brandColor}
          hidden={!this.context.lastPage}
          onClick={() => this.context.doAction('back')}
        />
        <h3 className="gh-portal-main-title">{t('Passkeys')}</h3>
      </header>
    );
  }

  renderPasskeyList() {
    if (!this.state.passkeys.length) {
      return null;
    }
    return (
      <div className="gh-portal-list" style={{ marginTop: '20px' }}>
        {this.state.passkeys.map((passkey) => {
          const addedDate = this.formatPasskeyCreatedAt(passkey.created_at);
          return (
            <section key={passkey.id}>
              <div className="gh-portal-list-detail">
                <h3>{passkey.name}</h3>
                {addedDate && <p>{addedDate}</p>}
              </div>
              <button
                type="button"
                className="gh-portal-btn gh-portal-btn-list"
                disabled={this.state.passkeyBusy}
                style={{ color: this.context.brandColor }}
                onClick={() => this.removePasskey(passkey.id)}
              >
                {t('Remove')}
              </button>
            </section>
          );
        })}
      </div>
    );
  }

  render() {
    if (!this.context.member) {
      return null;
    }
    const hasValidPasskeyName = Boolean(this.state.passkeyName.trim());
    return (
      <div className="gh-portal-content">
        {this.renderHeader()}
        <CloseButton />
        <div className="gh-portal-section">
          <p>{t('Sign in with Touch ID, Face ID, your device PIN, or a security key.')}</p>
          {this.state.passkeysAvailable ? (
            <>
              {this.renderPasskeyList()}
              <div style={{ marginTop: '20px' }}>
                <InputForm
                  fields={[
                    {
                      type: 'text',
                      value: this.state.passkeyName,
                      placeholder: t('MacBook Touch ID'),
                      label: t('Passkey name'),
                      name: 'passkeyName',
                      required: true,
                      errorMessage: this.state.passkeyError,
                    },
                  ]}
                  onChange={(event) =>
                    this.setState({ passkeyName: event.target.value, passkeyError: '' })
                  }
                />
              </div>
              <ActionButton
                dataTestId="add-passkey"
                disabled={this.state.passkeyBusy || !hasValidPasskeyName}
                onClick={() => this.addPasskey()}
                brandColor={this.context.brandColor}
                label={t('Add passkey')}
                isRunning={this.state.passkeyBusy}
                isPrimary={hasValidPasskeyName}
                style={{ width: '100%', marginTop: '12px' }}
              />
            </>
          ) : (
            <p>{t('Passkeys are not available in this browser.')}</p>
          )}
        </div>
      </div>
    );
  }
}
