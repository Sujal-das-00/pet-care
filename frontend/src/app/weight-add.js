import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, ChoiceRow, DateField, ErrorNote, Field, ModalScreen } from '../components/ui';
import { PetSelector } from '../components/pets';
import { useAuth } from '../state/AuthContext';
import { usePetSelection } from '../state/PetContext';
import { PetsApi } from '../api/resources';
import { useSubmit } from '../hooks/useSubmit';
import { isDate, todayISO } from '../utils/format';
import { badLocal } from '../utils/forms';

export default function WeightAdd() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { pets, selected, selectPet } = usePetSelection();
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState(user?.preferences?.weightUnit || 'kg');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const num = Number(value.replace(',', '.'));
  const valid = num > 0 && isDate(date) && selected;

  const { submit, busy, error } = useSubmit(() =>
    PetsApi.addWeight(selected.id, {
      value: num, unit, note,
      // noon local on the chosen day avoids timezone edge cases around midnight
      measuredAt: date === todayISO() ? undefined : new Date(`${date}T12:00:00+09:00`).toISOString(),
    }),
  );

  return (
    <ModalScreen footer={<Button title={t('common.save')} onPress={submit} loading={busy} disabled={!valid} />}>
      <ErrorNote message={error} />
      <View style={{ marginBottom: 16 }}><PetSelector pets={pets} selected={selected} onSelect={selectPet} /></View>
      <Field label={t('weight.value')} value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="4.2" error={value && !(num > 0) ? t('forms.badNumber') : undefined} />
      <ChoiceRow value={unit} onChange={setUnit} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }, { value: 'g', label: 'g' }]} />
      <DateField label={t('weight.date')} value={date} onChangeText={setDate} error={badLocal(date, 'date', t)} />
      <Field label={t('forms.note')} value={note} onChangeText={setNote} maxLength={200} />
    </ModalScreen>
  );
}
