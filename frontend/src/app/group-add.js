import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText, Button, ChoiceRow, ErrorNote, Field, ModalScreen, Row } from '../components/ui';
import { PrefecturePicker, TINT } from '../components/community';
import { CommunityApi } from '../api/resources';
import { useRefreshCommunity } from '../hooks/useCommunity';
import { colors, fonts } from '../theme';
import { errMsg } from '../utils/format';
import { RequireCommunity } from '../components/Paywall';

const EMOJIS = ['🐾', '🐶', '🐱', '🐕', '🐈', '🦮', '🐩', '🥾', '🌳', '📸', '🏃', '🧺'];

function GroupAddScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const refresh = useRefreshCommunity();
  const [f, setF] = useState({ name: '', description: '', kind: 'general', species: 'any', breed: '', prefecture: null, city: '', emoji: '🐾', tint: 'green' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const { community } = await CommunityApi.create({ ...f, name: f.name.trim(), description: f.description.trim(), breed: f.kind === 'breed' ? f.breed.trim() : '', prefecture: f.prefecture || null });
      refresh();
      router.replace(`/groups/${community.id}`);
    } catch (e) {
      setError(errMsg(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalScreen footer={<Button title={t('community.createSubmit')} onPress={submit} loading={busy} disabled={f.name.trim().length < 2} />}>
      <ErrorNote message={error} />
      <Row gap={10} style={{ flexWrap: 'wrap', marginBottom: 16 }}>
        {EMOJIS.map((e) => (
          <Pressable key={e} onPress={() => set('emoji')(e)} style={{ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: TINT[f.tint], borderWidth: 3, borderColor: f.emoji === e ? colors.green : 'transparent' }}>
            <Text style={{ fontSize: 24 }}>{e}</Text>
          </Pressable>
        ))}
      </Row>
      <Row gap={10} style={{ marginBottom: 16 }}>
        {Object.entries(TINT).map(([k, c]) => (
          <Pressable key={k} onPress={() => set('tint')(k)} accessibilityLabel={k} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c, borderWidth: 3, borderColor: f.tint === k ? colors.green : colors.line }} />
        ))}
      </Row>
      <Field label={t('community.name')} value={f.name} onChangeText={set('name')} maxLength={60} />
      <Field label={t('community.description')} value={f.description} onChangeText={set('description')} multiline maxLength={500} />
      <AppText variant="small" style={{ fontFamily: fonts.semibold, color: colors.ink, marginBottom: 6, marginLeft: 4 }}>{t('community.kind')}</AppText>
      <ChoiceRow value={f.kind} onChange={set('kind')} options={['general', 'city', 'breed', 'activity', 'interest'].map((k) => ({ value: k, label: t(`community.kinds.${k}`) }))} />
      <AppText variant="small" style={{ fontFamily: fonts.semibold, color: colors.ink, marginBottom: 6, marginLeft: 4 }}>{t('community.forPets')}</AppText>
      <ChoiceRow value={f.species} onChange={set('species')} options={['any', 'dog', 'cat'].map((k) => ({ value: k, label: k === 'any' ? t('community.anyPet') : t(`pet.species.${k}`) }))} />
      {f.kind === 'breed' ? <Field label={t('pet.breed')} value={f.breed} onChangeText={set('breed')} maxLength={60} /> : null}
      <PrefecturePicker label={t('community.area')} value={f.prefecture} onChange={set('prefecture')} allowClear placeholder={t('community.nationwide')} />
      <AppText variant="tiny">{t('community.rulesNote')}</AppText>
    </ModalScreen>
  );
}

// Members only: non-members are sent to the unlock screen.
export default function GroupAdd() {
  return (
    <RequireCommunity>
      <GroupAddScreen />
    </RequireCommunity>
  );
}
