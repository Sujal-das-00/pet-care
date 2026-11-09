import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText, Button, ChoiceRow, ErrorNote, Field, ModalScreen } from '../components/ui';
import { SafetyApi } from '../api/resources';
import { useRefreshCommunity } from '../hooks/useCommunity';
import { errMsg } from '../utils/format';

const REASONS = ['spam', 'harassment', 'inappropriate', 'unsafe_event', 'privacy', 'other'];

export default function Report() {
  const { type, id } = useLocalSearchParams();
  const { t } = useTranslation();
  const router = useRouter();
  const refresh = useRefreshCommunity();
  const [reason, setReason] = useState(type === 'event' ? 'unsafe_event' : 'inappropriate');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await SafetyApi.report({ targetType: type, targetId: id, reason, note });
      refresh();
      setDone(true);
    } catch (e) {
      setError(errMsg(e, t));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <ModalScreen footer={<Button title={t('common.close')} onPress={() => router.back()} />}>
        <AppText variant="h1">{t('safety.thanksTitle')}</AppText>
        <AppText style={{ marginTop: 8 }}>{t('safety.thanksBody')}</AppText>
      </ModalScreen>
    );
  }
  return (
    <ModalScreen footer={<Button title={t('safety.sendReport')} onPress={submit} loading={busy} />}>
      <AppText style={{ marginBottom: 16 }}>{t('safety.reportIntro')}</AppText>
      <ErrorNote message={error} />
      <ChoiceRow value={reason} onChange={setReason} options={REASONS.map((r) => ({ value: r, label: t(`safety.reasons.${r}`) }))} />
      <Field label={t('safety.details')} value={note} onChangeText={setNote} multiline maxLength={500} />
      <AppText variant="tiny">{t('safety.emergency')}</AppText>
    </ModalScreen>
  );
}
