import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ErrorNote, Field, ModalScreen, TimeField } from '../components/ui';
import { PetsApi } from '../api/resources';
import { useSubmit } from '../hooks/useSubmit';
import { usePetSelection } from '../state/PetContext';
import { isTime } from '../utils/format';
import { badLocal } from '../utils/forms';

export default function FeedingAdd() {
  const { t } = useTranslation();
  const { selected } = usePetSelection();
  const [f, setF] = useState({ label: t('feed.defaultLabel'), localTime: '08:00', food: '' });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.label.trim() && isTime(f.localTime);
  const { submit, busy, error } = useSubmit(() => PetsApi.addFeeding(selected.id, { ...f, label: f.label.trim() }));

  return (
    <ModalScreen footer={<Button title={t('common.save')} onPress={submit} loading={busy} disabled={!valid} />}>
      <ErrorNote message={error} />
      <Field label={t('feed.label')} value={f.label} onChangeText={set('label')} maxLength={60} />
      <TimeField label={t('feed.time')} value={f.localTime} onChangeText={set('localTime')} error={badLocal(f.localTime, 'time', t)} />
      <Field label={t('feed.food')} value={f.food} onChangeText={set('food')} maxLength={100} />
    </ModalScreen>
  );
}
