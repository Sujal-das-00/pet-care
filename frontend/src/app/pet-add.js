import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Button, ChoiceRow, DateField, ErrorNote, Field, ModalScreen, Row } from '../components/ui';
import { PetsApi } from '../api/resources';
import { useSubmit } from '../hooks/useSubmit';
import { usePetSelection } from '../state/PetContext';
import { colors, fonts, radius } from '../theme';
import { isDate } from '../utils/format';
import { badLocal } from '../utils/forms';

const TRAITS = ['playful', 'calm', 'shy', 'energetic', 'friendly', 'curious'];

export default function PetAdd() {
  const { t } = useTranslation();
  const { selectPet } = usePetSelection();
  const [f, setF] = useState({ species: 'dog', name: '', breed: '', gender: 'unknown', dateOfBirth: '', personality: [] });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const toggle = (k) => setF((s) => ({ ...s, personality: s.personality.includes(k) ? s.personality.filter((x) => x !== k) : [...s.personality, k] }));

  const { submit, busy, error } = useSubmit(async () => {
    const { pet } = await PetsApi.create({ ...f, name: f.name.trim(), breed: f.breed.trim(), dateOfBirth: f.dateOfBirth || null });
    selectPet(pet.id);
  });
  const valid = f.name.trim() && (!f.dateOfBirth || isDate(f.dateOfBirth));

  return (
    <ModalScreen footer={<Button title={t('common.save')} onPress={submit} loading={busy} disabled={!valid} />}>
      <ErrorNote message={error} />
      <Row gap={12} style={{ marginBottom: 20 }}>
        {[['dog', '🐶', colors.peach], ['cat', '🐱', colors.lavender]].map(([s, emoji, tint]) => (
          <Pressable key={s} onPress={() => set('species')(s)} style={{ flex: 1, alignItems: 'center', padding: 14, borderRadius: radius.xl, backgroundColor: tint, borderWidth: 3, borderColor: f.species === s ? colors.green : 'transparent' }}>
            <Text style={{ fontSize: 44 }}>{emoji}</Text>
            <Text style={{ fontFamily: fonts.bold, color: colors.ink }}>{t(`pet.species.${s}`)}</Text>
          </Pressable>
        ))}
      </Row>
      <Field label={t('pet.name')} value={f.name} onChangeText={set('name')} maxLength={40} />
      <Field label={t('pet.breed')} value={f.breed} onChangeText={set('breed')} />
      <AppText variant="small" style={{ fontFamily: fonts.semibold, color: colors.ink, marginBottom: 6, marginLeft: 4 }}>{t('pet.gender')}</AppText>
      <ChoiceRow value={f.gender} onChange={set('gender')} options={['male', 'female', 'unknown'].map((g) => ({ value: g, label: t(`pet.genders.${g}`) }))} />
      <DateField label={t('pet.dob')} value={f.dateOfBirth} onChangeText={set('dateOfBirth')} hint={t('pet.dobHint')} error={badLocal(f.dateOfBirth, 'date', t)} />
      <AppText variant="small" style={{ fontFamily: fonts.semibold, color: colors.ink, marginBottom: 6, marginLeft: 4 }}>{t('pet.personality')}</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {TRAITS.map((k) => {
          const on = f.personality.includes(k);
          return (
            <Pressable key={k} onPress={() => toggle(k)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: on ? colors.green : colors.surface, borderWidth: 1, borderColor: on ? colors.green : colors.line }}>
              <Text style={{ fontFamily: fonts.semibold, color: on ? '#fff' : colors.inkSoft }}>{t(`traits.${k}`)}</Text>
            </Pressable>
          );
        })}
      </View>
    </ModalScreen>
  );
}
