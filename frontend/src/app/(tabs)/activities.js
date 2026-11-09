import { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, Chip, DemoRibbon, EmptyState, Row, Screen, SectionHeader, Segmented, Gap } from '../../components/ui';
import { Hero } from '../../components/pets';
import { ChallengeCard, LeaderboardView } from '../../components/challenge';
import { CommunityPaywall } from '../../components/Paywall';
import { useAuth } from '../../state/AuthContext';
import { useCommunityAccess } from '../../hooks/useMembership';
import { useChallenges, useRefreshChallenges } from '../../hooks/useChallenges';
import { colors, fonts, space } from '../../theme';
import { DEMO_MODE } from '../../config';
import { demoActivity } from '../../demo/fixtures';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Walking/steps tracking is Phase 2. Until then this tab says so honestly (or shows labelled demo data). */
function MyActivity() {
  const { t } = useTranslation();
  const a = demoActivity;
  if (!DEMO_MODE) {
    return (
      <>
        <SectionHeader title={t('activities.today')} />
        <EmptyState icon="walk-outline" title={t('activities.soonTitle')} body={t('activities.soonBody')} />
      </>
    );
  }
  return (
    <>
      <SectionHeader title={t('activities.today')} />
      <Card style={{ overflow: 'hidden' }}>
        <DemoRibbon />
        <Row gap={20}>
          <View style={{ width: 120, height: 120, borderRadius: 60, borderWidth: 12, borderColor: colors.greenBar, borderTopColor: colors.greenTrack, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 22, color: colors.ink }}>{a.km} km</Text>
            <AppText variant="tiny">of {a.goal} km</AppText>
          </View>
          <View style={{ flex: 1, gap: 12 }}>
            <Row gap={10}><Ionicons name="footsteps" size={20} color={colors.inkSoft} /><AppText variant="h3">{a.steps.toLocaleString()} {t('activities.steps')}</AppText></Row>
            <Row gap={10}><Ionicons name="flame" size={20} color={colors.orange} /><AppText variant="h3">{a.kcal} kcal</AppText></Row>
            <Row gap={10}><Ionicons name="time-outline" size={20} color={colors.inkSoft} /><AppText variant="h3">{a.minutes} min</AppText></Row>
          </View>
        </Row>
      </Card>
      <SectionHeader title={t('activities.progress')} icon="stats-chart" />
      <Card style={{ overflow: 'hidden' }}>
        <DemoRibbon />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 110 }}>
          {a.week.map((v, i) => (
            <View key={i} style={{ alignItems: 'center', width: 30 }}>
              <View style={{ width: 24, height: 80 * v, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: i < 4 ? colors.greenBar : '#DDE9CF' }} />
              <AppText variant="tiny" style={{ marginTop: 4 }}>{t(`days.${DAYS[i]}`)}</AppText>
            </View>
          ))}
        </View>
      </Card>
    </>
  );
}

function Challenges() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const active = useChallenges('active');
  const upcoming = useChallenges('upcoming');
  const ended = useChallenges('ended');
  const open = (c) => router.push(`/challenges/${c.id}`);
  const a = active.data?.items ?? [];
  const u = upcoming.data?.items ?? [];
  const e = (ended.data?.items ?? []).slice(0, 5);

  return (
    <>
      <SectionHeader title={t('challenges.thisWeek')} icon="trophy" iconColor={colors.gold} />
      {a.map((c) => <ChallengeCard key={c.id} challenge={c} onPress={() => open(c)} />)}
      {!a.length && !active.isLoading ? (
        <EmptyState icon="trophy-outline" title={t('challenges.noneTitle')} body={t('challenges.noneBody')}
          action={user?.role === 'admin' ? <Button small title={t('admin.postChallenge')} onPress={() => router.push('/admin-challenge-form')} /> : null} />
      ) : null}
      {u.length ? <><SectionHeader title={t('challenges.comingUp')} icon="calendar-outline" />{u.map((c) => <ChallengeCard key={c.id} challenge={c} onPress={() => open(c)} />)}</> : null}
      {e.length ? <><SectionHeader title={t('challenges.pastResults')} icon="ribbon-outline" />{e.map((c) => <ChallengeCard key={c.id} challenge={c} onPress={() => open(c)} />)}</> : null}
      <AppText variant="tiny" style={{ textAlign: 'center', marginTop: 8 }}>{t('challenges.noPrizes')}</AppText>
    </>
  );
}

function Leaderboards() {
  const { t } = useTranslation();
  const active = useChallenges('active');
  const ended = useChallenges('ended');
  const list = [...(active.data?.items ?? []), ...(ended.data?.items ?? []).slice(0, 4)];
  const [picked, setPicked] = useState(null);
  const current = list.find((c) => c.id === picked) ?? list[0];

  if (!list.length && !active.isLoading) {
    return <><SectionHeader title={t('leaderboard.title')} icon="podium" iconColor={colors.gold} /><EmptyState icon="podium-outline" title={t('leaderboard.noChallengeTitle')} body={t('leaderboard.noChallengeBody')} /></>;
  }
  return (
    <>
      <SectionHeader title={t('leaderboard.title')} icon="podium" iconColor={colors.gold} />
      <Row gap={8} style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        {list.map((c) => <Chip key={c.id} label={`${c.emoji} ${c.title}${c.status === 'ended' ? ` (${t('challenges.status.ended').toLowerCase()})` : ''}`} selected={current?.id === c.id} onPress={() => setPicked(c.id)} />)}
      </Row>
      {current ? <LeaderboardView key={current.id} challengeId={current.id} /> : null}
    </>
  );
}

export default function Activities() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('activity');
  const { locked, loading } = useCommunityAccess();
  useRefreshChallenges();

  return (
    <Screen
      header={
        <>
          <Hero height={190} compact>
            <View style={{ paddingTop: insets.top + 8, maxWidth: '58%' }}>
              <Row gap={8}><Ionicons name="paw" size={28} color={colors.orange} /><AppText variant="display">{t('activities.title')}</AppText></Row>
              <AppText variant="small" style={{ marginTop: 6 }}>{t('activities.subtitle')}</AppText>
            </View>
          </Hero>
          <View style={{ paddingHorizontal: 20, marginTop: -26 }}>
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'activity', label: t('activities.myActivity') },
                { value: 'challenges', label: t('activities.challenges') },
                { value: 'leaderboard', label: t('activities.leaderboard') },
              ]}
            />
          </View>
        </>
      }
    >
      <Gap h={space.sm} />
      {tab === 'activity' ? <MyActivity /> : loading ? null : locked ? <CommunityPaywall /> : tab === 'challenges' ? <Challenges /> : <Leaderboards />}
    </Screen>
  );
}
