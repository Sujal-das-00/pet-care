import { useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, Chip, EmptyState, ErrorNote, Field, Gap, ProgressBar, Row, Screen, SectionHeader } from '../../components/ui';
import { LeaderboardView, useScoreText } from '../../components/challenge';
import { TINT } from '../../components/community';
import { RequireCommunity } from '../../components/Paywall';
import { usePetSelection } from '../../state/PetContext';
import { ChallengeApi } from '../../api/resources';
import { useChallenge, useMyEntries, useRefreshChallenges } from '../../hooks/useChallenges';
import { colors, space } from '../../theme';
import { errMsg, fmtDate, fmtShort, todayISO } from '../../utils/format';
import { DateTime } from 'luxon';

const yesterday = () => DateTime.fromISO(todayISO(), { zone: 'Asia/Tokyo' }).minus({ days: 1 }).toISODate();

function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams();
  const { t } = useTranslation();
  const router = useRouter();
  const score = useScoreText();
  const refresh = useRefreshChallenges();
  const { pets } = usePetSelection();
  const query = useChallenge(id);
  const entries = useMyEntries(id);
  const c = query.data?.challenge;

  const [value, setValue] = useState('');
  const [petId, setPetId] = useState(null);
  const [day, setDay] = useState('today');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  if (query.isError) return <Screen><EmptyState icon="alert-circle-outline" title={t('challenges.gone')} action={<Button small title={t('common.back')} onPress={() => router.back()} />} /></Screen>;
  if (!c) return <Screen><View /></Screen>;

  const active = c.status === 'active';
  const single = c.metric === 'active_days' || c.metric === 'check_ins';
  const eligible = pets.filter((p) => c.species.includes(p.species));
  const needsPet = c.species.length < 2;
  const chosenPet = petId ?? (needsPet ? eligible[0]?.id ?? null : null);
  const unitLabel = c.metric === 'distance_km' ? 'km' : t('challenges.minutesShort');
  const num = Number(value.replace(',', '.'));
  const canLog = active && c.joined && (single || (num > 0 && num <= c.maxPerEntry)) && (!needsPet || chosenPet);

  const run = async (fn) => { setError(''); setSaved(''); setBusy(true); try { await fn(); refresh(); } catch (e) { setError(e.status === 400 || e.status === 409 || e.status === 429 ? e.message : errMsg(e, t)); } finally { setBusy(false); } };

  const submit = () => run(async () => {
    const r = await ChallengeApi.addEntry(id, { ...(single ? {} : { value: num }), petId: chosenPet, loggedOn: day === 'yesterday' ? yesterday() : undefined, note: note.trim() });
    setValue(''); setNote('');
    setSaved(t('challenges.logged', { score: score(c.metric, r.myScore) }));
  });

  return (
    <Screen padBottom={60} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={refresh} tintColor={colors.green} />}>
      <Stack.Screen options={{ title: t('challenges.title') }} />
      <Card tint={TINT[c.tint]}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 52 }}>{c.emoji}</Text>
          <AppText variant="h1" style={{ textAlign: 'center', marginTop: 4 }}>{c.title}</AppText>
          <Row gap={6} style={{ flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
            <Chip label={t(`challenges.status.${c.status}`)} tint={active ? colors.green : colors.surface} ink={active ? '#fff' : colors.inkSoft} />
            <Chip label={`${fmtShort(c.startsOn)} – ${fmtShort(c.endsOn)}`} tint={colors.surface} ink={colors.inkSoft} icon="calendar" />
            <Chip label={t('challenges.participants', { count: c.participantCount })} tint={colors.surface} ink={colors.inkSoft} icon="people" />
            {c.species.length < 2 ? <Chip label={c.species[0] === 'cat' ? `🐱 ${t('leaderboard.cats')}` : `🐶 ${t('leaderboard.dogs')}`} tint={colors.surface} ink={colors.inkSoft} /> : null}
          </Row>
          {c.description ? <AppText style={{ textAlign: 'center', marginTop: 10, color: colors.ink }}>{c.description}</AppText> : null}
        </View>
        {c.joined ? (
          <View style={{ marginTop: 14 }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <AppText variant="small" style={{ color: colors.ink }}>{t('challenges.yourScore')}</AppText>
              <AppText variant="h2">{score(c.metric, c.myScore)}{c.goal ? ` / ${score(c.metric, c.goal)}` : ''}</AppText>
            </Row>
            {c.goal ? <ProgressBar value={c.myScore} max={c.goal} /> : null}
          </View>
        ) : null}
      </Card>
      <Gap h={space.md} />
      <ErrorNote message={error} />

      {!c.joined && c.status !== 'ended' ? <Button icon="flag" title={t('challenges.join')} loading={busy} onPress={() => run(() => ChallengeApi.join(id))} /> : null}

      {c.instructions ? (<><SectionHeader title={t('challenges.howItWorks')} icon="reader-outline" /><AppText style={{ color: colors.ink }}>{c.instructions}</AppText></>) : null}

      {c.joined && active ? (
        <>
          <SectionHeader title={t('challenges.logTitle')} icon="add-circle-outline" />
          <Card>
            {single ? (
              <AppText style={{ marginBottom: 10, color: colors.ink }}>{c.metric === 'active_days' ? t('challenges.dayHint') : t('challenges.checkInHint')}</AppText>
            ) : (
              <Field label={`${t('challenges.amount')} (${unitLabel})`} value={value} onChangeText={(v) => { setValue(v); setSaved(''); }} keyboardType="decimal-pad" placeholder={c.metric === 'distance_km' ? '3.5' : '30'}
                hint={t('challenges.limits', { max: c.maxPerEntry, cap: c.dailyCap })} />
            )}
            {eligible.length ? (
              <>
                <AppText variant="small" style={{ marginBottom: 6 }}>{needsPet ? t('challenges.whichPet') : t('challenges.withPet')}</AppText>
                <Row gap={8} style={{ flexWrap: 'wrap', marginBottom: 12 }}>
                  {!needsPet ? <Chip label={t('challenges.noPet')} selected={chosenPet === null} onPress={() => setPetId(null)} /> : null}
                  {eligible.map((p) => <Chip key={p.id} label={`${p.species === 'cat' ? '🐱' : '🐶'} ${p.name}`} selected={chosenPet === p.id} onPress={() => setPetId(p.id)} />)}
                </Row>
              </>
            ) : needsPet ? <AppText variant="small" style={{ color: colors.danger, marginBottom: 10 }}>{t('challenges.needPet')}</AppText> : null}
            <Row gap={8} style={{ marginBottom: 12 }}>
              <Chip label={t('challenges.today')} selected={day === 'today'} onPress={() => setDay('today')} />
              <Chip label={t('challenges.yesterday')} selected={day === 'yesterday'} onPress={() => setDay('yesterday')} />
            </Row>
            <Field label={t('forms.note')} value={note} onChangeText={setNote} maxLength={200} />
            <Button title={single ? t('challenges.checkIn') : t('challenges.log')} icon="checkmark" onPress={submit} loading={busy} disabled={!canLog} />
            {saved ? <AppText variant="small" style={{ color: colors.greenDark, marginTop: 10, fontFamily: 'Nunito_700Bold' }}>{saved}</AppText> : null}
            <AppText variant="tiny" style={{ marginTop: 10 }}>{t('challenges.honesty')}</AppText>
          </Card>
        </>
      ) : null}

      {c.joined && (entries.data?.items ?? []).length ? (
        <>
          <SectionHeader title={t('challenges.myEntries')} icon="list-outline" />
          <Card>
            {entries.data.items.slice(0, 10).map((e, i) => (
              <Row key={e.id} style={[{ justifyContent: 'space-between', paddingVertical: 8 }, i ? { borderTopWidth: 1, borderTopColor: colors.line } : null]}>
                <View>
                  <AppText variant="h3">{score(c.metric, e.value)}</AppText>
                  <AppText variant="tiny">{fmtDate(e.loggedOn)}{e.note ? ` · ${e.note}` : ''}</AppText>
                </View>
                {active ? <Pressable hitSlop={8} accessibilityLabel={t('common.delete')} onPress={() => run(() => ChallengeApi.deleteEntry(id, e.id))}><Ionicons name="trash-outline" size={18} color={colors.inkMute} /></Pressable> : null}
              </Row>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader title={t('leaderboard.title')} icon="podium" iconColor={colors.gold} />
      <LeaderboardView challengeId={id} limit={25} />
    </Screen>
  );
}

// Members only: non-members are sent to the unlock screen.
export default function ChallengeDetail() {
  return (
    <RequireCommunity>
      <ChallengeDetailScreen />
    </RequireCommunity>
  );
}
