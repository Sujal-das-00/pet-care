import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, Chip, ChoiceRow, DateField, ErrorNote, Field, ModalScreen, Row, TimeField } from '../components/ui';
import { CATEGORY_EMOJI, PrefecturePicker } from '../components/community';
import { EventApi } from '../api/resources';
import { useAuth } from '../state/AuthContext';
import { useCommunities, useIdea, useRefreshCommunity } from '../hooks/useCommunity';
import { colors, fonts } from '../theme';
import { errMsg, isDate, isTime, todayISO } from '../utils/format';
import { badLocal } from '../utils/forms';
import { RequireCommunity } from '../components/Paywall';

const CATS = ['monthly_paw_walk', 'picnic', 'dog_park', 'cat_gathering', 'photo_day', 'breed_meetup', 'fitness_walk', 'birthday', 'adventure', 'other'];
const ZONE = 'Asia/Tokyo'; // events are local; Japan-first
const toUtc = (date, time) => DateTime.fromISO(`${date}T${time}`, { zone: ZONE }).toUTC().toISO();
const addMinutes = (time, mins) => DateTime.fromISO(`2000-01-01T${time}`).plus({ minutes: mins }).toFormat('HH:mm');

function EventAddScreen() {
  const { ideaId, communityId } = useLocalSearchParams();
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const refresh = useRefreshCommunity();
  const idea = useIdea(ideaId);
  const mine = useCommunities({ scope: 'mine', limit: 30 });

  const [f, setF] = useState({
    title: '', description: '', category: 'other', date: DateTime.now().setZone(ZONE).plus({ days: 7 }).toISODate(), start: '10:00', end: '11:30',
    place: '', prefecture: user?.profile?.prefecture || null, city: '', max: '', petTypes: ['dog', 'cat'], instructions: '',
    communityId: communityId || null, publicPlace: false,
  });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Pre-fill from the chosen idea once it arrives.
  const prefilled = useRef(false);
  useEffect(() => {
    const i = idea.data?.idea;
    if (!i || prefilled.current) return;
    prefilled.current = true;
    setF((s) => ({ ...s, title: i.title, category: i.category, instructions: i.instructions, end: addMinutes(s.start, i.suggestedDurationMinutes), petTypes: i.petTypes }));
  }, [idea.data]);

  const startOk = isDate(f.date) && isTime(f.start);
  const endOk = isTime(f.end) && f.end > f.start;
  const maxNum = f.max ? Number(f.max) : null;
  const valid = f.title.trim().length >= 3 && startOk && endOk && f.place.trim().length >= 2 && f.publicPlace && f.petTypes.length > 0 && (!f.max || (Number.isInteger(maxNum) && maxNum >= 2));

  const toggleType = (p) => setF((s) => ({ ...s, petTypes: s.petTypes.includes(p) ? s.petTypes.filter((x) => x !== p) : [...s.petTypes, p] }));

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const { event } = await EventApi.create({
        title: f.title.trim(), description: f.description.trim(), category: f.category,
        communityId: f.communityId || null, ideaId: ideaId || null,
        startsAt: toUtc(f.date, f.start), endsAt: toUtc(f.date, f.end),
        place: { name: f.place.trim(), prefecture: f.prefecture || null, city: f.city.trim() },
        publicPlaceConfirmed: true, maxParticipants: maxNum, petTypes: f.petTypes, instructions: f.instructions.trim(),
      });
      refresh();
      router.replace(`/events/${event.id}`);
    } catch (e) {
      setError(errMsg(e, t));
    } finally {
      setBusy(false);
    }
  };

  const label = (k) => <AppText variant="small" style={{ fontFamily: fonts.semibold, color: colors.ink, marginBottom: 6, marginLeft: 4 }}>{t(k)}</AppText>;

  return (
    <ModalScreen footer={<Button title={t('events.publish')} onPress={submit} loading={busy} disabled={!valid} />}>
      <Card tint={colors.yellow} style={{ marginBottom: 16 }}><AppText variant="small" style={{ color: colors.ink }}>{t('events.independentNote')}</AppText></Card>
      <ErrorNote message={error} />
      <Field label={t('events.name')} value={f.title} onChangeText={set('title')} maxLength={80} />
      {label('events.category')}
      <Row gap={8} style={{ flexWrap: 'wrap', marginBottom: 16 }}>
        {CATS.map((c) => <Chip key={c} label={`${CATEGORY_EMOJI[c]} ${t(`events.cat.${c}`)}`} selected={f.category === c} onPress={() => set('category')(c)} />)}
      </Row>
      <Field label={t('events.description')} value={f.description} onChangeText={set('description')} multiline maxLength={1500} />

      <DateField label={t('forms.date')} value={f.date} onChangeText={set('date')} error={badLocal(f.date, 'date', t) || (isDate(f.date) && f.date < todayISO() ? t('events.pastDate') : undefined)} />
      <Row gap={12} align="flex-start">
        <View style={{ flex: 1 }}><TimeField label={t('events.starts')} value={f.start} onChangeText={set('start')} error={badLocal(f.start, 'time', t)} /></View>
        <View style={{ flex: 1 }}><TimeField label={t('events.ends')} value={f.end} onChangeText={set('end')} error={badLocal(f.end, 'time', t) || (isTime(f.end) && isTime(f.start) && f.end <= f.start ? t('events.endAfterStart') : undefined)} /></View>
      </Row>

      <Field label={t('events.venue')} value={f.place} onChangeText={set('place')} maxLength={100} placeholder={t('events.venuePh')} />
      <PrefecturePicker label={t('community.area')} value={f.prefecture} onChange={set('prefecture')} allowClear />
      <Field label={t('onboarding.city')} value={f.city} onChangeText={set('city')} maxLength={60} placeholder={t('onboarding.cityPh')} />
      <Pressable onPress={() => set('publicPlace')(!f.publicPlace)} accessibilityRole="checkbox" accessibilityState={{ checked: f.publicPlace }} style={{ marginBottom: 16 }}>
        <Row align="flex-start" gap={10}>
          <Ionicons name={f.publicPlace ? 'checkbox' : 'square-outline'} size={24} color={f.publicPlace ? colors.green : colors.inkMute} />
          <AppText variant="small" style={{ flex: 1, color: colors.ink }}>{t('events.publicPlace')}</AppText>
        </Row>
      </Pressable>

      <Field label={t('events.max')} value={f.max} onChangeText={(v) => set('max')(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder={t('events.unlimited')} hint={t('events.maxHint')} />
      {label('events.petTypes')}
      <Row gap={8} style={{ marginBottom: 16 }}>
        {['dog', 'cat'].map((p) => <Chip key={p} label={`${p === 'dog' ? '🐶' : '🐱'} ${t(`pet.species.${p}`)}`} selected={f.petTypes.includes(p)} onPress={() => toggleType(p)} />)}
      </Row>
      <Field label={t('events.instructions')} value={f.instructions} onChangeText={set('instructions')} multiline maxLength={1000} hint={t('events.instructionsHint')} />

      {label('events.postIn')}
      <ChoiceRow value={f.communityId} onChange={set('communityId')} options={[{ value: null, label: t('events.openEvent') }, ...(mine.data?.items ?? []).map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }))]} />
    </ModalScreen>
  );
}

// Members only: non-members are sent to the unlock screen.
export default function EventAdd() {
  return (
    <RequireCommunity>
      <EventAddScreen />
    </RequireCommunity>
  );
}
