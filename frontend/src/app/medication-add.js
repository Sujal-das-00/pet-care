import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, DateField, ErrorNote, Field, ModalScreen, Row, TimeField } from '../components/ui';
import { PetsApi } from '../api/resources';
import { useSubmit } from '../hooks/useSubmit';
import { usePetSelection } from '../state/PetContext';
import { colors } from '../theme';
import { isDate, isTime, todayISO } from '../utils/format';
import { badLocal } from '../utils/forms';

export default function MedicationAdd() {
  const { t } = useTranslation();
  const { selected } = usePetSelection();
  const [f, setF] = useState({ name: '', dosageInstructions: '', prescribedBy: '', startDate: todayISO(), endDate: '' });
  const [times, setTimes] = useState(['08:00']);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  const valid = f.name.trim() && isDate(f.startDate) && (!f.endDate || (isDate(f.endDate) && f.endDate >= f.startDate)) && times.every(isTime);
  const { submit, busy, error } = useSubmit(() =>
    PetsApi.addMedication(selected.id, {
      name: f.name.trim(), dosageInstructions: f.dosageInstructions.trim(), prescribedBy: f.prescribedBy.trim(),
      startDate: f.startDate, endDate: f.endDate || null,
      schedules: times.map((localTime) => ({ localTime })),
    }),
  );

  return (
    <ModalScreen footer={<Button title={t('common.save')} onPress={submit} loading={busy} disabled={!valid} />}>
      <Card tint={colors.yellow} style={{ marginBottom: 16 }}>
        <AppText variant="small" style={{ color: colors.ink }}>{t('med.disclaimer')}</AppText>
      </Card>
      <ErrorNote message={error} />
      <Field label={t('med.name')} value={f.name} onChangeText={set('name')} maxLength={80} />
      <Field label={t('med.dosage')} value={f.dosageInstructions} onChangeText={set('dosageInstructions')} multiline maxLength={500} hint={t('med.dosageHint')} />
      <Field label={t('med.prescribedBy')} value={f.prescribedBy} onChangeText={set('prescribedBy')} maxLength={80} />
      <DateField label={t('med.start')} value={f.startDate} onChangeText={set('startDate')} error={badLocal(f.startDate, 'date', t)} />
      <DateField label={t('med.end')} value={f.endDate} onChangeText={set('endDate')} error={badLocal(f.endDate, 'date', t)} hint={t('med.endHint')} />

      <AppText variant="h3" style={{ marginBottom: 8 }}>{t('med.times')}</AppText>
      {times.map((tm, i) => (
        <Row key={i} gap={10} align="flex-start">
          <View style={{ flex: 1 }}><TimeField value={tm} onChangeText={(v) => setTimes((a) => a.map((x, j) => (j === i ? v : x)))} error={badLocal(tm, 'time', t)} /></View>
          {times.length > 1 ? (
            <Pressable onPress={() => setTimes((a) => a.filter((_, j) => j !== i))} style={{ paddingTop: 14 }}><Ionicons name="close-circle" size={24} color={colors.inkMute} /></Pressable>
          ) : null}
        </Row>
      ))}
      {times.length < 6 ? <Button small variant="soft" icon="add" title={t('med.addTime')} onPress={() => setTimes((a) => [...a, '20:00'])} style={{ alignSelf: 'flex-start' }} /> : null}
    </ModalScreen>
  );
}
