import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, Chip, DemoRibbon, EmptyState, ProgressBar, Row, Screen, SectionHeader, Gap } from '../../components/ui';
import { Hero, PetSelector } from '../../components/pets';
import ReminderRow from '../../components/ReminderRow';
import { useAuth } from '../../state/AuthContext';
import { usePetSelection } from '../../state/PetContext';
import { RemindersApi } from '../../api/resources';
import { useAction, useHome } from '../../hooks/usePets';
import { colors, fonts, radius, space } from '../../theme';
import { greetingKey } from '../../utils/format';
import { enablePush, pushStatus } from '../../utils/push';
import { DEMO_MODE } from '../../config';
import { demoActivity } from '../../demo/fixtures';
import { useChallenges } from '../../hooks/useChallenges';
import { EventCard } from '../../components/community';
import { useCommunityAccess } from '../../hooks/useMembership';

const SHORTCUTS = [
  { key: 'petCare', icon: 'paw', tint: colors.greenSoft, ink: colors.greenDark, to: '/pet' },
  { key: 'fitness', icon: 'walk', tint: colors.peach, ink: colors.peachInk, to: '/activities' },
  { key: 'challenges', icon: 'trophy', tint: colors.lavender, ink: colors.lavenderInk, to: '/activities' },
  { key: 'events', icon: 'calendar', tint: colors.blue, ink: colors.blueInk, to: '/community' },
];

export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { pets, selected, selectPet } = usePetSelection();
  const home = useHome();
  const { locked } = useCommunityAccess();
  const activeChallenges = useChallenges('active', !locked);
  const challenge = activeChallenges.data?.items?.[0];
  const complete = useAction(({ id, action }) => RemindersApi.complete(id, action));
  const [notif, setNotif] = useState('unknown');

  useEffect(() => { pushStatus().then(setNotif); }, []);
  const refresh = useCallback(() => home.refetch(), [home]);

  const data = home.data;
  const reminders = (data?.reminders ?? []).filter((r) => !selected || !r.petId || r.petId === selected.id || pets.length < 2);
  const petNames = pets.map((p) => p.name).join(' & ');
  const unread = data?.unreadNotifications ?? 0;

  return (
    <Screen
      padBottom={140}
      refreshControl={<RefreshControl refreshing={home.isRefetching} onRefresh={refresh} tintColor={colors.green} />}
      header={
        <Hero height={250}>
          <View style={{ paddingTop: insets.top + 8 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={8}>
                <Ionicons name="paw" size={28} color={colors.orange} />
                <Text style={{ fontFamily: fonts.bold, fontSize: 24, color: colors.ink }}>PawCircle</Text>
              </Row>
              <Row gap={18}>
                <Pressable onPress={() => router.push('/notifications')} accessibilityLabel={t('notifications.title')} hitSlop={8}>
                  <Ionicons name="notifications-outline" size={26} color={colors.ink} />
                  {unread > 0 ? <View style={{ position: 'absolute', top: -1, right: -1, width: 11, height: 11, borderRadius: 6, backgroundColor: colors.orange }} /> : null}
                </Pressable>
                <Pressable onPress={() => router.push('/settings')} accessibilityLabel={t('settings.title')} hitSlop={8}>
                  <Ionicons name="person-outline" size={26} color={colors.ink} />
                </Pressable>
              </Row>
            </Row>
            <AppText variant="display" style={{ marginTop: 22 }}>{t(greetingKey(user?.timezone), { name: user?.profile?.displayName || '' })} 👋</AppText>
            {petNames ? <AppText style={{ marginTop: 2 }}>{t('home.howAre', { pets: petNames })}</AppText> : null}
            <View style={{ marginTop: 14, marginRight: 120 }}>
              <PetSelector pets={pets} selected={selected} onSelect={selectPet} />
            </View>
          </View>
        </Hero>
      }
    >
      <Gap h={space.lg} />

      {/* Today's walk — real walk tracking arrives in Phase 2 */}
      <Card tint={colors.greenSoft} style={{ overflow: 'hidden' }}>
        {DEMO_MODE ? <DemoRibbon /> : null}
        <Row gap={8}><Ionicons name="paw" size={18} color={colors.green} /><AppText variant="h3">{t('home.todaysWalk')}</AppText></Row>
        {DEMO_MODE ? (
          <>
            <Row style={{ alignItems: 'flex-end', marginTop: 6 }} gap={6}>
              <AppText variant="display" style={{ fontSize: 34 }}>{demoActivity.km} km</AppText>
              <AppText style={{ marginBottom: 6 }}>{t('home.ofGoal', { goal: demoActivity.goal })}</AppText>
            </Row>
            <Gap h={10} />
            <ProgressBar value={demoActivity.km} max={demoActivity.goal} />
          </>
        ) : (
          <View style={{ marginTop: 6 }}>
            <AppText>{t('home.walkSoon')}</AppText>
            <Gap h={10} />
            <ProgressBar value={0} />
          </View>
        )}
      </Card>

      {/* Quick shortcuts */}
      <Row gap={10} style={{ marginTop: space.lg }} align="stretch">
        {SHORTCUTS.map((s) => (
          <Pressable key={s.key} onPress={() => router.push(s.to)} style={{ flex: 1, backgroundColor: s.tint, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', gap: 8 }}>
            <Ionicons name={s.icon} size={28} color={s.ink} />
            <Text numberOfLines={1} style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: colors.ink }}>{t(`home.shortcuts.${s.key}`)}</Text>
          </Pressable>
        ))}
      </Row>

      {/* Care reminders (real data) */}
      <SectionHeader title={t('home.careToday')} icon="medkit" action={t('common.seeAll')} onAction={() => router.push('/pet')} />
      {home.isError ? (
        <EmptyState icon="cloud-offline-outline" title={t('common.offline')} action={<Button small title={t('common.retry')} onPress={refresh} />} />
      ) : !pets.length && !home.isLoading ? (
        <EmptyState icon="paw-outline" title={t('home.noPetTitle')} body={t('home.noPetBody')} action={<Button small title={t('pet.addTitle')} onPress={() => router.push('/pet-add')} />} />
      ) : reminders.length ? (
        <Card padded={false} style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
          {reminders.slice(0, 4).map((r, i) => (
            <View key={r.id} style={i ? { borderTopWidth: 1, borderTopColor: colors.line } : null}>
              <ReminderRow reminder={r} busy={complete.isPending} onDone={() => complete.mutate({ id: r.id, action: 'done' })} onSkip={() => complete.mutate({ id: r.id, action: 'skip' })} />
            </View>
          ))}
        </Card>
      ) : (
        <Card tint={colors.surface}>
          <Row gap={12}><Ionicons name="checkmark-circle" size={28} color={colors.green} /><View style={{ flex: 1 }}><AppText variant="h3">{t('home.allCaughtUp')}</AppText><AppText variant="small">{t('home.allCaughtUpBody')}</AppText></View></Row>
        </Card>
      )}

      {reminders.length > 0 && notif === 'undetermined' ? (
        <Card tint={colors.yellow} style={{ marginTop: space.md }} onPress={async () => setNotif(await enablePush().then(async () => pushStatus()))}>
          <Row gap={10}><Ionicons name="notifications" size={22} color={colors.yellowInk} /><AppText variant="small" style={{ flex: 1, color: colors.ink }}>{t('home.enablePush')}</AppText><Ionicons name="chevron-forward" size={18} color={colors.yellowInk} /></Row>
        </Card>
      ) : null}

      {/* This week's challenge (posted by the PawCircle team) */}
      <View style={{ marginTop: space.xl }}>
        <Card tint={colors.yellow} onPress={() => router.push(locked ? '/unlock' : challenge ? `/challenges/${challenge.id}` : '/activities')}>
          <Chip label={`${t('home.thisWeeksChallenge')} 🏆`} tint={colors.lavender} ink={colors.lavenderInk} />
          {challenge ? (
            <>
              <AppText variant="h1" style={{ marginTop: 10 }}>{challenge.emoji} {challenge.title}</AppText>
              <AppText style={{ marginVertical: 6 }} numberOfLines={2}>{challenge.description}</AppText>
              <Button small title={challenge.joined ? t('challenges.view') : t('home.joinChallenge')} style={{ alignSelf: 'flex-start' }} onPress={() => router.push(`/challenges/${challenge.id}`)} />
            </>
          ) : (
            <>
              <AppText variant="h2" style={{ marginTop: 10 }}>{locked ? t('home.challengeLockedTitle') : t('home.challengeSoonTitle')}</AppText>
              <AppText variant="small" style={{ marginTop: 4 }}>{locked ? t('home.challengeLockedBody') : t('home.challengeSoonBody')}</AppText>
            </>
          )}
        </Card>
      </View>

      {/* Upcoming event: the next one you're hosting or going to */}
      <SectionHeader title={t('home.upcomingEvent')} icon="calendar-outline" action={t('common.seeAll')} onAction={() => router.push('/community')} />
      {data?.nextEvent ? (
        <EventCard event={data.nextEvent} onPress={() => router.push(`/events/${data.nextEvent.id}`)} />
      ) : (
        <Card onPress={() => router.push(locked ? '/unlock' : '/community')} tint={locked ? colors.lavender : undefined}>
          <Row gap={12}>
            <Ionicons name={locked ? 'lock-closed' : 'calendar-outline'} size={26} color={locked ? colors.lavenderInk : colors.blueInk} />
            <View style={{ flex: 1 }}>
              <AppText variant="h3">{locked ? t('home.communityLockedTitle') : t('home.noEventTitle')}</AppText>
              <AppText variant="small">{locked ? t('home.communityLockedBody') : t('home.eventSoon')}</AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
          </Row>
        </Card>
      )}
    </Screen>
  );
}
