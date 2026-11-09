import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ChoiceRow, DateField, ErrorNote, Field, ModalScreen, TimeField, AppText } from '../components/ui';
import { PetsApi } from '../api/resources';
import { useSubmit } from '../hooks/useSubmit';
import { usePetSelection } from '../state/PetContext';
import { isDate, isTime, todayISO } from '../utils/format';
import { badLocal } from '../utils/forms';

export default function AppointmentAdd() {
  const { t } = useTranslation();
  const { selected } = usePetSelection();
  const [f, setF] = useState({ clinicName: '', clinicAddress: '', clinicPhone: '', vetName: '', reason: '', date: todayISO(), time: '10:00', remind: 60 });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.clinicName.trim() && isDate(f.date) && isTime(f.time);

  const { submit, busy, error } = useSubmit(() =>
    PetsApi.addAppointment(selected.id, {
      clinicName: f.clinicName.trim(), clinicAddress: f.clinicAddress, clinicPhone: f.clinicPhone,
      vetName: f.vetName, reason: f.reason, reminderMinutesBefore: f.remind,
      scheduledAt: new Date(`${f.date}T${f.time}:00+09:00`).toISOString(), // clinics are local; Japan-first
    }),
  );

  return (
    <ModalScreen footer={<Button title={t('common.save')} onPress={submit} loading={busy} disabled={!valid} />}>
      <ErrorNote message={error} />
      <Field label={t('appt.clinic')} value={f.clinicName} onChangeText={set('clinicName')} maxLength={100} />
      <Field label={t('appt.address')} value={f.clinicAddress} onChangeText={set('clinicAddress')} maxLength={200} />
      <Field label={t('appt.phone')} value={f.clinicPhone} onChangeText={set('clinicPhone')} keyboardType="phone-pad" maxLength={30} />
      <Field label={t('appt.vet')} value={f.vetName} onChangeText={set('vetName')} maxLength={80} />
      <Field label={t('appt.reason')} value={f.reason} onChangeText={set('reason')} maxLength={200} />
      <DateField label={t('forms.date')} value={f.date} onChangeText={set('date')} error={badLocal(f.date, 'date', t)} />
      <TimeField label={t('forms.time')} value={f.time} onChangeText={set('time')} error={badLocal(f.time, 'time', t)} />
      <AppText variant="small" style={{ marginBottom: 6, marginLeft: 4 }}>{t('appt.remind')}</AppText>
      <ChoiceRow value={f.remind} onChange={set('remind')} options={[{ value: 30, label: t('appt.min', { n: 30 }) }, { value: 60, label: t('appt.hour', { n: 1 }) }, { value: 180, label: t('appt.hour', { n: 3 }) }, { value: 1440, label: t('appt.dayBefore') }]} />
    </ModalScreen>
  );
}
