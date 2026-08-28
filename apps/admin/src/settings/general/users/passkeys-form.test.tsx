import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import PasskeysForm from './passkeys-form';

const { fetchApi, startRegistration } = vi.hoisted(() => ({
  fetchApi: vi.fn(),
  startRegistration: vi.fn(),
}));

vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => true,
  startRegistration,
}));

vi.mock('@tryghost/admin-x-framework/helpers', () => ({
  apiUrl: (path: string) => path,
}));

vi.mock('@tryghost/admin-x-framework/hooks', () => ({
  useFetchApi: () => fetchApi,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('PasskeysForm', () => {
  beforeEach(() => {
    fetchApi.mockReset();
    startRegistration.mockReset();
    fetchApi.mockResolvedValue({ passkeys: [] });
  });

  it('requires a name and makes the add action primary when valid', async () => {
    render(<PasskeysForm />);

    const nameInput = await screen.findByLabelText('Passkey name');
    const addButton = screen.getByRole('button', { name: 'Add passkey' });

    expect(addButton).toBeDisabled();
    expect(addButton).toHaveClass('border-control-border');
    expect(addButton).not.toHaveClass('bg-primary');

    fireEvent.change(nameInput, { target: { value: '   ' } });
    expect(addButton).toBeDisabled();

    fireEvent.change(nameInput, { target: { value: '  Work MacBook  ' } });
    expect(addButton).toBeEnabled();
    expect(addButton).toHaveClass('bg-primary');
    expect(addButton).not.toHaveClass('border-control-border');
  });

  it('registers the passkey with the trimmed name and clears the input', async () => {
    startRegistration.mockResolvedValue({ id: 'credential-id' });
    fetchApi
      .mockResolvedValueOnce({ passkeys: [] })
      .mockResolvedValueOnce({ challenge: 'challenge' })
      .mockResolvedValueOnce({ passkeys: [] })
      .mockResolvedValueOnce({ passkeys: [] });

    render(<PasskeysForm />);

    const nameInput = await screen.findByLabelText('Passkey name');
    fireEvent.change(nameInput, { target: { value: '  Work MacBook  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add passkey' }));

    await waitFor(() => {
      expect(fetchApi).toHaveBeenCalledWith('/session/passkeys/registration', {
        method: 'PUT',
        body: JSON.stringify({ response: { id: 'credential-id' }, name: 'Work MacBook' }),
      });
    });
    await waitFor(() => expect(nameInput).toHaveValue(''));
  });
});
