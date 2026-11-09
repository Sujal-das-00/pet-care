import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { errMsg } from '../utils/format';

/**
 * Shared controller for form modals: runs `fn`, shows a readable error, refreshes the cache and
 * closes the modal on success.
 */
export function useSubmit(fn) {
  const router = useRouter();
  const qc = useQueryClient();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries();
      router.back();
    } catch (e) {
      setError(errMsg(e, t));
    } finally {
      setBusy(false);
    }
  };
  return { submit, busy, error, setError };
}
