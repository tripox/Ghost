import { useContext } from 'react';
import AppContext from '../../../../app-context';
import { t } from '../../../../utils/i18n';

const PasskeysAction = () => {
  const { doAction } = useContext(AppContext);
  const openPasskeys = () => {
    doAction('switchPage', {
      page: 'accountPasskeys',
      lastPage: 'accountHome',
    });
  };

  return (
    <section
      className="gh-portal-list-clickable"
      role="button"
      tabIndex={0}
      onClick={openPasskeys}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) {
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openPasskeys();
        }
      }}
    >
      <div className="gh-portal-list-detail">
        <h3>{t('Passkeys')}</h3>
        <p>{t('Manage your sign-in methods')}</p>
      </div>
      <span className="gh-portal-list-action" data-test-button="manage-passkeys" aria-hidden="true">
        {t('Manage')}
      </span>
    </section>
  );
};

export default PasskeysAction;
