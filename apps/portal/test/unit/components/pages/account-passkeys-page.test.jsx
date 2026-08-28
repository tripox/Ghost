import { fireEvent, render, waitFor } from '../../../utils/test-utils';
import AccountPasskeysPage from '../../../../src/components/pages/account-passkeys-page';
import { startRegistration } from '@simplewebauthn/browser';

vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => true,
  startRegistration: vi.fn(),
}));

describe('Account Passkeys Page', () => {
  beforeEach(() => {
    vi.mocked(startRegistration).mockReset();
  });

  test('requires a name before enabling the primary add action', async () => {
    const api = {
      member: {
        passkeys: vi.fn(() =>
          Promise.resolve({
            passkeys: [
              {
                id: 'passkey-id',
                name: 'Work MacBook',
                created_at: '2026-08-25T12:00:00.000Z',
              },
            ],
          }),
        ),
      },
    };
    const { getByLabelText, getByRole, getByText } = render(<AccountPasskeysPage />, {
      overrideContext: {
        api,
        lastPage: 'accountHome',
        locale: 'en-US',
      },
    });

    await waitFor(() => expect(getByText('Work MacBook')).toBeInTheDocument());
    expect(getByText(/Added .*2026/)).toBeInTheDocument();
    expect(getByLabelText('Passkey name')).toBeInTheDocument();

    const addButton = getByRole('button', { name: 'Add passkey' });
    expect(addButton).toHaveClass('gh-portal-btn');
    expect(addButton).toBeDisabled();
    expect(addButton).not.toHaveClass('gh-portal-btn-primary');

    fireEvent.change(getByLabelText('Passkey name'), { target: { value: '  Work laptop  ' } });

    expect(addButton).toBeEnabled();
    expect(addButton).toHaveClass('gh-portal-btn-primary');
  });

  test('shows a clear error when the authenticator is already registered', async () => {
    vi.mocked(startRegistration).mockRejectedValue({
      code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED',
    });
    const api = {
      member: {
        passkeys: vi.fn(() => Promise.resolve({ passkeys: [] })),
        getIntegrityToken: vi.fn(() => Promise.resolve('integrity-token')),
        beginPasskeyRegistration: vi.fn(() =>
          Promise.resolve({ options: {}, ceremony: 'ceremony' }),
        ),
      },
    };
    const { findByText, getByLabelText, getByRole } = render(<AccountPasskeysPage />, {
      overrideContext: { api },
    });

    fireEvent.change(getByLabelText('Passkey name'), { target: { value: 'Existing passkey' } });
    fireEvent.click(getByRole('button', { name: 'Add passkey' }));

    expect(await findByText('This passkey is already registered.')).toBeInTheDocument();
  });
});
