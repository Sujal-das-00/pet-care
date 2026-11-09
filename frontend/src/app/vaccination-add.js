import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, DateField, ErrorNote, Field, ModalScreen } from '../components/ui';
import { PetsApi } from '../api/resources';
import { useSubmit } from '../hooks/useSubmit';
import { usePetSelection } from '../state/PetContext';
import { isDate, todayISO } from '../utils/format';
import { badLocal } from '../utils/forms';

export default function VaccinationAdd() {
  const { t } = useTranslation();
  const { selected } = usePetSelection();
  const [f, setF] = useState({ name: '', administeredOn: todayISO(), nextDueOn: '', clinicName: '', notes: '' });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.name.trim() && isDate(f.administeredOn) && (!f.nextDueOn || (isDate(f.nextDueOn) && f.nextDueOn >= f.administeredOn));

  const { submit, busy, error } = useSubmit(() =>
    PetsApi.addVaccination(selected.id, { ...f, name: f.name.trim(), nextDueOn: f.nextDueOn || null }),
  );

  return (
    <ModalScreen footer={<Button title={t('common.save')} onPress={submit} loading={busy} disabled={!valid} />}>
      <ErrorNote message={error} />
      <Field label={t('vax.name')} value={f.name} onChangeText={set('name')} maxLength={80} />
      <DateField label={t('vax.date')} value={f.administeredOn} onChangeText={set('administeredOn')} error={badLocal(f.administeredOn, 'date', t)} />
      <DateField label={t('vax.nextDue')} value={f.nextDueOn} onChangeText={set('nextDueOn')} error={badLocal(f.nextDueOn, 'date', t)} hint={t('vax.nextHint')} />
      <Field label={t('vax.clinic')} value={f.clinicName} onChangeText={set('clinicName')} maxLength={100} />
      <Field label={t('forms.note')} value={f.notes} onChangeText={set('notes')} multiline maxLength={500} />
    </ModalScreen>
  );
}
