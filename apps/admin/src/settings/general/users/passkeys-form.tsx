import React, { useCallback, useEffect, useState } from 'react';
import { Button, Field, FieldDescription, FieldLabel, Input } from '@tryghost/shade/components';
import {
  browserSupportsWebAuthn,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
} from '@simplewebauthn/browser';
import { apiUrl } from '@tryghost/admin-x-framework/helpers';
import { useFetchApi } from '@tryghost/admin-x-framework/hooks';
import { toast } from 'sonner';

type Passkey = {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  backed_up: boolean;
};

const PasskeysForm: React.FC = () => {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [supported, setSupported] = useState(false);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [passkeyName, setPasskeyName] = useState('');
  const fetchApi = useFetchApi();
  const endpoint = apiUrl('/session/passkeys');
  const trimmedPasskeyName = passkeyName.trim();
  const hasValidPasskeyName = Boolean(trimmedPasskeyName);

  const load = useCallback(async () => {
    if (!browserSupportsWebAuthn()) {
      return;
    }
    setSupported(true);
    const body = await fetchApi<{ passkeys: Passkey[] }>(endpoint);
    setPasskeys(body.passkeys);
    setAvailable(true);
  }, [endpoint, fetchApi]);

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  const addPasskey = async () => {
    if (!trimmedPasskeyName) {
      return;
    }

    setBusy(true);
    try {
      const optionsJSON = await fetchApi<PublicKeyCredentialCreationOptionsJSON>(
        `${endpoint}/registration`,
        {
          method: 'POST',
        },
      );
      const response = await startRegistration({ optionsJSON });
      await fetchApi<{ passkeys: Passkey[] }>(`${endpoint}/registration`, {
        method: 'PUT',
        body: JSON.stringify({ response, name: trimmedPasskeyName }),
      });
      await load();
      setPasskeyName('');
      toast.success('Passkey added');
    } catch (error) {
      if ((error as Error).name !== 'NotAllowedError') {
        toast.error('Could not add passkey', { description: (error as Error).message });
      }
    } finally {
      setBusy(false);
    }
  };

  const removePasskey = async (passkey: Passkey) => {
    setBusy(true);
    try {
      await fetchApi(`${endpoint}/${passkey.id}`, {
        method: 'DELETE',
      });
      setPasskeys((current) => current.filter(({ id }) => id !== passkey.id));
      toast.success('Passkey removed');
    } catch (error) {
      toast.error('Could not remove passkey', { description: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (!supported || !available) {
    return null;
  }

  return (
    <Field>
      <div>
        <FieldLabel>Passkeys</FieldLabel>
        <FieldDescription>
          Use Touch ID, Face ID, your device PIN, or a security key instead of emailed sign-in
          codes.
        </FieldDescription>
      </div>
      {passkeys.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {passkeys.map((passkey) => (
            <div key={passkey.id} className="flex items-center justify-between rounded border p-3">
              <div className="flex flex-col">
                <span className="font-medium">{passkey.name}</span>
                <span className="text-sm text-muted-foreground">
                  Added {new Date(passkey.created_at).toLocaleDateString()}
                  {passkey.backed_up ? ' · Synced' : ''}
                </span>
              </div>
              <Button
                disabled={busy}
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => void removePasskey(passkey)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-end gap-2">
        <Field className="min-w-0 flex-1">
          <FieldLabel htmlFor="passkey-name">Passkey name</FieldLabel>
          <Input
            autoComplete="off"
            disabled={busy}
            id="passkey-name"
            placeholder="MacBook Touch ID"
            value={passkeyName}
            onChange={(event) => setPasskeyName(event.target.value)}
          />
        </Field>
        <Button
          disabled={busy || !hasValidPasskeyName}
          size="sm"
          type="button"
          variant={hasValidPasskeyName ? 'default' : 'outline'}
          onClick={() => void addPasskey()}
        >
          Add passkey
        </Button>
      </div>
    </Field>
  );
};

export default PasskeysForm;
