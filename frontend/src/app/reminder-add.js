import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppText, Button, ChoiceRow, DateField, ErrorNote, Field, ModalScreen, TimeField } from '../components/ui';
import { RemindersApi } from '../api/resources';
import { useSubmit } from '../hooks/useSubmit';
import { usePetSelection } from '../state/PetContext';
import { isDate, isTime, todayISO } from '../utils/format';
import { badLocal } from '../utils/forms';

export default function ReminderAdd() {
  const { t } = useTranslation();
  const { selected } = usePetSelection();
  const [f, setF] = useState({ kind: 'grooming', title: '', date: todayISO(), localTime: '10:00', recurrence: 'none' });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.title.trim() && isDate(f.date) && isTime(f.localTime);
  const { submit, busy, error } = useSubmit(() =>
    RemindersApi.create({ ...f, title: f.title.trim(), petId: selected?.id ?? null }),
  );

  return (
    <ModalScreen footer={<Button title={t('common.save')} onPress={submit} loading={busy} disabled={!valid} />}>
      <ErrorNote message={error} />
      <AppText variant="small" style={{ marginBottom: 6, marginLeft: 4 }}>{t('reminders.type')}</AppText>
      <ChoiceRow value={f.kind} onChange={set('kind')} options={['grooming', 'weight', 'general', 'custom'].map((k) => ({ value: k, label: t(`reminders.kinds.${k}`) }))} />
      <Field label={t('reminders.titleLabel')} value={f.title} onChangeText={set('title')} maxLength={120} />
      <DateField label={t('forms.date')} value={f.date} onChangeText={set('date')} error={badLocal(f.date, 'date', t)} />
      <TimeField label={t('forms.time')} value={f.localTime} onChangeText={set('localTime')} error={badLocal(f.localTime, 'time', t)} />
      <AppText variant="small" style={{ marginBottom: 6, marginLeft: 4 }}>{t('reminders.repeat')}</AppText>
      <ChoiceRow value={f.recurrence} onChange={set('recurrence')} options={['none', 'daily', 'weekly', 'monthly', 'yearly'].map((k) => ({ value: k, label: t(`reminders.rec.${k}`) }))} />
    </ModalScreen>
  );
}
