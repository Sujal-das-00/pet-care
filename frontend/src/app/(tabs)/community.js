import { useEffect, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Chip, EmptyState, ErrorNote, Gap, Row, Screen, SectionHeader, Segmented } from '../../components/ui';
import { Hero } from '../../components/pets';
import { ActionMenu, CATEGORY_EMOJI, CommunityRow, CommunityTile, EventCard, PostCard, PrefecturePicker } from '../../components/community';
import { useAuth } from '../../state/AuthContext';
import { CommunityApi, SafetyApi } from '../../api/resources';
import { ck, useCommunities, useEvents, useIdeas, usePostPages, useRefreshCommunity } from '../../hooks/useCommunity';
import { colors, fonts, radius, space } from '../../theme';
import { errMsg } from '../../utils/format';
import { confirmAction } from '../../utils/confirm';
import { CommunityPaywall } from '../../components/Paywall';
import { useCommunityAccess } from '../../hooks/useMembership';

function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

/** Feed of posts with like / menu actions, shared by Explore. */
function Feed() {
  const { t } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const refresh = useRefreshCommunity();
  const feed = usePostPages(ck.feed, CommunityApi.feed);
  const [menu, setMenu] = useState(null);
  const [error, setError] = useState('');
  const posts = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const source = feed.data?.pages?.[0]?.source;

  const toggleLike = async (p) => {
    try { await (p.liked ? CommunityApi.unlike(p.id) : CommunityApi.like(p.id)); refresh(); } catch (e) { setError(errMsg(e, t)); }
  };
  const block = (p) => confirmAction(t('safety.blockTitle', { name: p.author.displayName }), t('safety.blockBody'), t('safety.block'), async () => {
    try { await SafetyApi.block(p.author.id); refresh(); qc.invalidateQueries({ queryKey: ck.blocks }); } catch (e) { setError(errMsg(e, t)); }
  });
  const remove = (p) => confirmAction(t('community.deletePost'), '', t('common.delete'), async () => {
    try { await CommunityApi.deletePost(p.id); refresh(); } catch (e) { setError(errMsg(e, t)); }
  });

  return (
    <>
      <SectionHeader title={t('community.feed')} icon="chatbubble-ellipses-outline" />
      <ErrorNote message={error} />
      {source === 'discover' && posts.length ? <AppText variant="small" style={{ marginBottom: 8 }}>{t('community.feedDiscover')}</AppText> : null}
      {!posts.length && !feed.isLoading ? (
        <EmptyState icon="chatbubbles-outline" title={t('community.feedEmptyTitle')} body={t('community.feedEmptyBody')} />
      ) : null}
      {posts.map((p) => (
        <PostCard key={p.id} post={p} onPress={() => router.push(`/posts/${p.id}`)} onLike={() => toggleLike(p)} onMenu={() => setMenu(p)}
          onCommunity={() => router.push(`/groups/${p.communityId}`)} />
      ))}
      {feed.hasNextPage ? <Button variant="ghost" small title={t('common.loadMore')} onPress={() => feed.fetchNextPage()} loading={feed.isFetchingNextPage} /> : null}
      <ActionMenu
        visible={Boolean(menu)} onClose={() => setMenu(null)} title={menu?.author.displayName}
        actions={menu ? [
          ...(menu.mine ? [{ label: t('community.deletePost'), icon: 'trash-outline', danger: true, onPress: () => remove(menu) }] : [
            { label: t('safety.report'), icon: 'flag-outline', onPress: () => router.push(`/report?type=post&id=${menu.id}`) },
            { label: t('safety.block'), icon: 'ban-outline', danger: true, onPress: () => block(menu) },
          ]),
        ] : []}
      />
    </>
  );
}

function Explore() {
  const { t } = useTranslation();
  const router = useRouter();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const popular = useCommunities({ scope: 'popular', limit: 10 });
  const results = useCommunities({ scope: 'popular', q: dq, limit: 20 });
  const featured = useEvents({ scope: 'upcoming', limit: 1 });
  const searching = dq.length > 0;

  return (
    <>
      <Row style={styles.search} gap={10}>
        <Ionicons name="search" size={20} color={colors.inkMute} />
        <TextInput value={q} onChangeText={setQ} placeholder={t('community.searchPh')} placeholderTextColor={colors.inkMute} style={styles.searchInput} autoCorrect={false} returnKeyType="search" />
        {q ? <Pressable onPress={() => setQ('')} hitSlop={8}><Ionicons name="close-circle" size={20} color={colors.inkMute} /></Pressable> : null}
      </Row>

      {searching ? (
        <>
          <Gap h={space.md} />
          {(results.data?.items ?? []).map((c) => <CommunityRow key={c.id} community={c} onPress={() => router.push(`/groups/${c.id}`)} />)}
          {results.data && !results.data.items.length ? <EmptyState icon="search-outline" title={t('community.noResults')} body={t('community.noResultsBody')} action={<Button small title={t('community.create')} onPress={() => router.push('/group-add')} />} /> : null}
        </>
      ) : (
        <>
          <SectionHeader title={t('community.popular')} />
          {popular.data?.items?.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 4, paddingRight: 8 }}>
              {popular.data.items.map((c) => <CommunityTile key={c.id} community={c} onPress={() => router.push(`/groups/${c.id}`)} />)}
            </ScrollView>
          ) : popular.isLoading ? null : (
            <EmptyState icon="people-outline" title={t('community.noneYetTitle')} body={t('community.noneYetBody')} action={<Button small title={t('community.create')} onPress={() => router.push('/group-add')} />} />
          )}

          {featured.data?.items?.[0] ? (
            <>
              <SectionHeader title={t('events.featured')} icon="calendar-outline" />
              <EventCard event={featured.data.items[0]} onPress={() => router.push(`/events/${featured.data.items[0].id}`)} />
            </>
          ) : null}
          <Feed />
        </>
      )}
    </>
  );
}

function MyGroups() {
  const { t } = useTranslation();
  const router = useRouter();
  const mine = useCommunities({ scope: 'mine', limit: 30 });
  const items = mine.data?.items ?? [];
  return (
    <>
      <SectionHeader title={t('community.groups')} icon="people-circle-outline" />
      {items.map((c) => <CommunityRow key={c.id} community={c} onPress={() => router.push(`/groups/${c.id}`)} right={c.myRole === 'admin' ? <Chip label={t('community.admin')} /> : null} />)}
      {!items.length && !mine.isLoading ? <EmptyState icon="people-outline" title={t('community.noGroupsTitle')} body={t('community.noGroupsBody')} /> : null}
      <Gap h={space.md} />
      <Button variant="soft" icon="add" title={t('community.create')} onPress={() => router.push('/group-add')} />
    </>
  );
}

function Events() {
  const { t } = useTranslation();
  const router = useRouter();
  const [scope, setScope] = useState('upcoming');
  const ideas = useIdeas();
  const events = useEvents({ scope, limit: 30 });
  const items = events.data?.items ?? [];
  return (
    <>
      <Button icon="add" title={t('events.host')} onPress={() => router.push('/event-add')} />
      <SectionHeader title={t('events.ideas')} icon="bulb-outline" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 4, paddingRight: 8 }}>
        {(ideas.data?.items ?? []).map((i) => (
          <Pressable key={i.id} onPress={() => router.push(`/ideas/${i.id}`)} style={styles.idea}>
            <Text style={{ fontSize: 30 }}>{i.emoji || CATEGORY_EMOJI[i.category]}</Text>
            <AppText variant="h3" numberOfLines={2} style={{ marginTop: 6 }}>{i.title}</AppText>
            <AppText variant="tiny" numberOfLines={1}>{t('events.groupSize', { min: i.recommendedGroupSize?.min, max: i.recommendedGroupSize?.max })}</AppText>
          </Pressable>
        ))}
      </ScrollView>

      <SectionHeader title={t('community.events')} icon="calendar-outline" />
      <Row gap={8} style={{ marginBottom: 12 }}>
        {['upcoming', 'mine'].map((s) => <Chip key={s} label={t(`events.scope.${s}`)} selected={scope === s} onPress={() => setScope(s)} />)}
      </Row>
      {items.map((e) => <EventCard key={e.id} event={e} onPress={() => router.push(`/events/${e.id}`)} />)}
      {!items.length && !events.isLoading ? <EmptyState icon="calendar-outline" title={t(scope === 'mine' ? 'events.noneMineTitle' : 'events.noneTitle')} body={t('events.noneBody')} action={<Button small title={t('events.host')} onPress={() => router.push('/event-add')} />} /> : null}
    </>
  );
}

function Nearby() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, updateMe } = useAuth();
  const refresh = useRefreshCommunity();
  const pref = user?.profile?.prefecture || '';
  const comms = useCommunities({ scope: 'nearby', limit: 20 });
  const events = useEvents({ scope: 'nearby', limit: 20 });
  const [error, setError] = useState('');

  const setPref = async (code) => {
    setError('');
    try { await updateMe({ profile: { prefecture: code } }); refresh(); } catch (e) { setError(errMsg(e, t)); }
  };

  return (
    <>
      <ErrorNote message={error} />
      <PrefecturePicker label={t('nearby.yourArea')} value={pref} onChange={setPref} allowClear />
      {pref ? <Button variant="soft" icon="chatbubbles" title={t('chat.localChat')} onPress={() => router.push(`/chat-room?room=${encodeURIComponent(`local:${pref}`)}`)} style={{ marginBottom: 8 }} /> : null}
      {!pref ? (
        <EmptyState icon="location-outline" title={t('nearby.chooseTitle')} body={t('nearby.chooseBody')} />
      ) : (
        <>
          <SectionHeader title={t('nearby.communities')} icon="people-outline" />
          {(comms.data?.items ?? []).map((c) => <CommunityRow key={c.id} community={c} onPress={() => router.push(`/groups/${c.id}`)} />)}
          {comms.data && !comms.data.items.length ? <EmptyState icon="people-outline" title={t('nearby.noCommunities')} action={<Button small title={t('community.create')} onPress={() => router.push('/group-add')} />} /> : null}
          <SectionHeader title={t('nearby.events')} icon="calendar-outline" />
          {(events.data?.items ?? []).map((e) => <EventCard key={e.id} event={e} onPress={() => router.push(`/events/${e.id}`)} />)}
          {events.data && !events.data.items.length ? <EmptyState icon="calendar-outline" title={t('nearby.noEvents')} action={<Button small title={t('events.host')} onPress={() => router.push('/event-add')} />} /> : null}
        </>
      )}
    </>
  );
}

export default function Community() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tab, setTab] = useState('explore');
  const { locked, loading } = useCommunityAccess();
  const refresh = useRefreshCommunity();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => { setRefreshing(true); refresh(); setTimeout(() => setRefreshing(false), 600); };

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green} />}
      header={
        <>
          <Hero height={190} compact>
            <View style={{ paddingTop: insets.top + 8, maxWidth: '58%' }}>
              <Row gap={8}><Ionicons name="people" size={28} color={colors.orange} /><AppText variant="display">{t('community.title')}</AppText></Row>
              {locked ? null : <Button small variant="soft" icon="chatbubbles" title={t('chat.open')} onPress={() => router.push('/chat')} style={{ alignSelf: 'flex-start', marginTop: 10 }} />}
              <AppText variant="small" style={{ marginTop: 6 }}>{t('community.subtitle')}</AppText>
            </View>
          </Hero>
          {locked ? null : <View style={{ paddingHorizontal: 20, marginTop: -26 }}>
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'explore', label: t('community.explore') },
                { value: 'groups', label: t('community.groups') },
                { value: 'events', label: t('community.events') },
                { value: 'nearby', label: t('community.nearby') },
              ]}
            />
          </View>}
        </>
      }
    >
      <Gap h={space.sm} />
      {loading ? null : locked ? <CommunityPaywall /> : tab === 'explore' ? <Explore /> : tab === 'groups' ? <MyGroups /> : tab === 'events' ? <Events /> : <Nearby />}
    </Screen>
  );
}

const styles = {
  search: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: Platform.OS === 'web' ? 4 : 10, marginTop: space.lg, borderWidth: 1.5, borderColor: colors.line },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, paddingVertical: Platform.OS === 'web' ? 8 : 0, outlineStyle: 'none' },
  idea: { width: 150, backgroundColor: colors.yellow, borderRadius: radius.xl, padding: 14 },
};
