import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText, Button, Card, Chip, DateField, ErrorNote, Field, ModalScreen, Row } from '../components/ui';
import { AdminChallengeApi } from '../api/resources';
import { useAuth } from '../state/AuthContext';
import { useRefreshChallenges } from '../hooks/useChallenges';
import { colors, fonts } from '../theme';
import { errMsg, isDate } from '../utils/format';
import { badLocal } from '../utils/forms';

const ZONE = 'Asia/Tokyo';
const METRICS = ['distance_km', 'activity_minutes', 'active_days', 'check_ins'];
const EMOJI = ['🏆', '🚶', '🐾', '📸', '🧺', '🤝', '🐱', '🌳'];

/** Monday..Sunday (Japan time) of this week or next week. */
function week(offset) {
  const now = DateTime.now().setZone(ZONE);
  const monday = now.startOf('week').plus({ weeks: offset });
  return { startsOn: monday.toISODate(), endsOn: monday.plus({ days: 6 }).toISODate() };
}

function AdminChallengeForm() {
  const { id } = useLocalSearchParams();
  const { t } = useTranslation();
  const router = useRouter();
  const refresh = useRefreshChallenges();
  const all = useQuery({ queryKey: ['admin', 'challenges'], queryFn: AdminChallengeApi.list, enabled: Boolean(id) });
  const [f, setF] = useState({
    title: '', description: '', instructions: '', emoji: '🏆', metric: 'distance_km', goal: '', ...week(1), species: ['dog', 'cat'], maxPerEntry: '', dailyCap: '', published: true,
  });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Editing: load the existing values once.
  const loaded = useRef(false);
  useEffect(() => {
    const c = all.data?.items?.find((x) => x.id === id);
    if (!c || loaded.current) return;
    loaded.current = true;
    setF({ title: c.title, description: c.description, instructions: c.instructions, emoji: c.emoji, metric: c.metric, goal: c.goal ? String(c.goal) : '', startsOn: c.startsOn, endsOn: c.endsOn, species: c.species, maxPerEntry: String(c.maxPerEntry), dailyCap: String(c.dailyCap), published: c.published });
  }, [all.data, id]);

  const num = (s) => (s === '' ? null : Number(s));
  const valid = f.title.trim().length >= 3 && isDate(f.startsOn) && isDate(f.endsOn) && f.endsOn >= f.startsOn && f.species.length > 0;

  const speciesChoice = f.species.length === 2 ? 'both' : f.species[0];
  const submit = async () => {
    setBusy(true); setError('');
    const body = {
      title: f.title.trim(), description: f.description.trim(), instructions: f.instructions.trim(), emoji: f.emoji || '🏆', metric: f.metric,
      goal: num(f.goal), startsOn: f.startsOn, endsOn: f.endsOn, species: f.species, published: f.published,
      ...(num(f.maxPerEntry) ? { maxPerEntry: num(f.maxPerEntry) } : {}), ...(num(f.dailyCap) ? { dailyCap: num(f.dailyCap) } : {}),
    };
    try {
      if (id) await AdminChallengeApi.update(id, body); else await AdminChallengeApi.create(body);
      refresh();
      router.back();
    } catch (e) { setError(e.details?.[0] ? `${e.details[0].path}: ${e.details[0].message}` : errMsg(e, t)); } finally { setBusy(false); }
  };

  const label = (k) => <AppText variant="small" style={{ fontFamily: fonts.semibold, color: colors.ink, marginBottom: 6, marginLeft: 4 }}>{t(k)}</AppText>;

  return (
    <ModalScreen footer={<Button title={id ? t('common.save') : f.published ? t('admin.publish') : t('admin.saveDraft')} onPress={submit} loading={busy} disabled={!valid} />}>
      <Card tint={colors.yellow} style={{ marginBottom: 16 }}><AppText variant="small" style={{ color: colors.ink }}>{t('admin.formNote')}</AppText></Card>
      <ErrorNote message={error} />
      <Row gap={8} style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        {EMOJI.map((e) => <Chip key={e} label={e} selected={f.emoji === e} onPress={() => set('emoji')(e)} />)}
      </Row>
      <Field label={t('admin.title')} value={f.title} onChangeText={set('title')} maxLength={80} placeholder={t('admin.titlePh')} />
      <Field label={t('community.description')} value={f.description} onChangeText={set('description')} multiline maxLength={1000} />
      <Field label={t('admin.instructions')} value={f.instructions} onChangeText={set('instructions')} multiline maxLength={1000} />

      {label('admin.measures')}
      <Row gap={8} style={{ flexWrap: 'wrap', marginBottom: 16 }}>
        {METRICS.map((m) => <Chip key={m} label={t(`admin.metric.${m}`)} selected={f.metric === m} onPress={() => set('metric')(m)} />)}
      </Row>

      <Row gap={8} style={{ marginBottom: 12 }}>
        <Chip label={t('admin.thisWeek')} onPress={() => setF((s) => ({ ...s, ...week(0) }))} tint={colors.greenSoft} />
        <Chip label={t('admin.nextWeek')} onPress={() => setF((s) => ({ ...s, ...week(1) }))} tint={colors.greenSoft} />
      </Row>
      <Row gap={12} align="flex-start">
        <View style={{ flex: 1 }}><DateField label={t('admin.starts')} value={f.startsOn} onChangeText={set('startsOn')} error={badLocal(f.startsOn, 'date', t)} /></View>
        <View style={{ flex: 1 }}><DateField label={t('admin.ends')} value={f.endsOn} onChangeText={set('endsOn')} error={badLocal(f.endsOn, 'date', t) || (isDate(f.startsOn) && isDate(f.endsOn) && f.endsOn < f.startsOn ? t('events.endAfterStart') : undefined)} /></View>
      </Row>

      {label('admin.openTo')}
      <Row gap={8} style={{ marginBottom: 16 }}>
        <Chip label={t('admin.both')} selected={speciesChoice === 'both'} onPress={() => set('species')(['dog', 'cat'])} />
        <Chip label={`🐶 ${t('admin.dogsOnly')}`} selected={speciesChoice === 'dog'} onPress={() => set('species')(['dog'])} />
        <Chip label={`🐱 ${t('admin.catsOnly')}`} selected={speciesChoice === 'cat'} onPress={() => set('species')(['cat'])} />
      </Row>

      <Field label={t('admin.goal')} value={f.goal} onChangeText={(v) => set('goal')(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" hint={t('admin.goalHint')} />
      <Row gap={12} align="flex-start">
        <View style={{ flex: 1 }}><Field label={t('admin.maxEntry')} value={f.maxPerEntry} onChangeText={(v) => set('maxPerEntry')(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder={t('admin.default')} /></View>
        <View style={{ flex: 1 }}><Field label={t('admin.dailyCap')} value={f.dailyCap} onChangeText={(v) => set('dailyCap')(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder={t('admin.default')} /></View>
      </Row>
      <AppText variant="tiny" style={{ marginBottom: 16 }}>{t('admin.capsNote')}</AppText>

      <Row gap={8}>
        <Chip label={t('admin.publishedChip')} selected={f.published} onPress={() => set('published')(true)} />
        <Chip label={t('admin.draftChip')} selected={!f.published} onPress={() => set('published')(false)} />
      </Row>
    </ModalScreen>
  );
}

export default function Gate() {
  const { user } = useAuth();
  return user?.role === 'admin' ? <AdminChallengeForm /> : null;
}
