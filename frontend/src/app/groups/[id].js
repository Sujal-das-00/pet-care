import { useState } from 'react';
import { Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, Chip, EmptyState, ErrorNote, Gap, Row, Screen, SectionHeader } from '../../components/ui';
import { ActionMenu, EventCard, PostCard, TINT } from '../../components/community';
import { usePetSelection } from '../../state/PetContext';
import { CommunityApi, SafetyApi } from '../../api/resources';
import { ck, useCommunity, useEvents, usePostPages, useRefreshCommunity } from '../../hooks/useCommunity';
import { colors, fonts, space } from '../../theme';
import { errMsg } from '../../utils/format';
import { prefName } from '../../utils/prefectures';
import { confirmAction } from '../../utils/confirm';
import { RequireCommunity } from '../../components/Paywall';

function GroupDetailScreen() {
  const { id } = useLocalSearchParams();
  const { t } = useTranslation();
  const router = useRouter();
  const refresh = useRefreshCommunity();
  const { selected: pet } = usePetSelection();
  const community = useCommunity(id);
  const posts = usePostPages(ck.posts(id), (q) => CommunityApi.posts(id, q), Boolean(id));
  const events = useEvents({ scope: 'community', communityId: id, limit: 5 }, Boolean(id));
  const [text, setText] = useState('');
  const [asPet, setAsPet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(null); // 'group' | post object

  const c = community.data?.community;
  const isMember = Boolean(c?.myRole);
  const items = posts.data?.pages.flatMap((p) => p.items) ?? [];

  const run = async (fn) => {
    setError('');
    try { await fn(); refresh(); } catch (e) { setError(errMsg(e, t)); }
  };
  const join = () => run(() => CommunityApi.join(id));
  const leave = () => confirmAction(t('community.leaveTitle'), t('community.leaveBody', { name: c?.name }), t('community.leave'), () => run(async () => { await CommunityApi.leave(id); }));
  const send = async () => {
    setBusy(true);
    await run(async () => {
      await CommunityApi.createPost(id, { text: text.trim(), petId: asPet && pet ? pet.id : null });
      setText('');
    });
    setBusy(false);
  };

  if (community.isError) {
    return <Screen><EmptyState icon="alert-circle-outline" title={t('community.notFound')} action={<Button small title={t('common.back')} onPress={() => router.back()} />} /></Screen>;
  }

  return (
    <Screen
      padBottom={60}
      refreshControl={<RefreshControl refreshing={community.isRefetching} onRefresh={refresh} tintColor={colors.green} />}
    >
      <Stack.Screen options={{ title: c?.name || '', headerRight: () => (
        <Pressable onPress={() => setMenu('group')} hitSlop={10}><Ionicons name="ellipsis-horizontal" size={24} color={colors.ink} /></Pressable>
      ) }} />
      {c ? (
        <>
          <Card tint={TINT[c.tint]} style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 56 }}>{c.emoji}</Text>
            <AppText variant="h1" style={{ textAlign: 'center', marginTop: 6 }}>{c.name}</AppText>
            <Row gap={6} style={{ flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
              {c.official ? <Chip label={t('community.official')} icon="checkmark-circle" /> : null}
              {c.prefecture ? <Chip label={prefName(c.prefecture)} tint={colors.surface} ink={colors.inkSoft} icon="location" /> : null}
              {c.species !== 'any' ? <Chip label={t(`pet.species.${c.species}`)} tint={colors.surface} ink={colors.inkSoft} /> : null}
              {c.breed ? <Chip label={c.breed} tint={colors.surface} ink={colors.inkSoft} /> : null}
            </Row>
            {c.description ? <AppText style={{ textAlign: 'center', marginTop: 10, color: colors.ink }}>{c.description}</AppText> : null}
            <Row gap={24} style={{ marginTop: 12 }}>
              <View style={{ alignItems: 'center' }}><AppText variant="h2">{c.memberCount}</AppText><AppText variant="tiny">{t('community.members')}</AppText></View>
              <View style={{ alignItems: 'center' }}><AppText variant="h2">{c.postCount}</AppText><AppText variant="tiny">{t('community.postsLabel')}</AppText></View>
              <View style={{ alignItems: 'center' }}><AppText variant="h2">{c.upcomingEvents}</AppText><AppText variant="tiny">{t('community.events')}</AppText></View>
            </Row>
            <View style={{ alignSelf: 'stretch', marginTop: 14 }}>
              {isMember
                ? <Button variant="ghost" icon="checkmark" title={t('community.joined')} onPress={leave} />
                : <Button icon="add" title={t('community.join')} onPress={join} />}
            </View>
          </Card>
          <Gap h={space.md} />
          <ErrorNote message={error} />

          {isMember ? (
            <Card style={{ marginBottom: 12 }}>
              <TextInput value={text} onChangeText={setText} placeholder={t('community.composerPh')} placeholderTextColor={colors.inkMute} multiline maxLength={1000}
                style={{ minHeight: 70, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, textAlignVertical: 'top', outlineStyle: 'none' }} />
              <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
                {pet ? <Chip label={`${pet.species === 'cat' ? '🐱' : '🐶'} ${pet.name}`} selected={asPet} onPress={() => setAsPet(!asPet)} /> : <View />}
                <Button small title={t('community.post')} onPress={send} loading={busy} disabled={!text.trim()} />
              </Row>
            </Card>
          ) : (
            <Card tint={colors.yellow} style={{ marginBottom: 12 }}><AppText variant="small" style={{ color: colors.ink }}>{t('community.joinToPost')}</AppText></Card>
          )}

          {(events.data?.items ?? []).length ? (
            <>
              <SectionHeader title={t('community.events')} icon="calendar-outline" />
              {events.data.items.map((e) => <EventCard key={e.id} event={e} onPress={() => router.push(`/events/${e.id}`)} />)}
            </>
          ) : null}
          {isMember ? <Button small variant="soft" icon="chatbubbles" title={t('chat.groupChat')} onPress={() => router.push(`/chat-room?room=${encodeURIComponent(`community:${id}`)}`)} style={{ alignSelf: 'flex-start', marginBottom: 8 }} /> : null}
          {isMember ? <Button small variant="soft" icon="add" title={t('events.hostHere')} onPress={() => router.push(`/event-add?communityId=${id}`)} style={{ alignSelf: 'flex-start', marginBottom: 4 }} /> : null}

          <SectionHeader title={t('community.postsTitle')} icon="chatbubble-ellipses-outline" />
          {!items.length && !posts.isLoading ? <EmptyState icon="chatbubbles-outline" title={t('community.noPostsTitle')} body={t(isMember ? 'community.noPostsMember' : 'community.noPostsGuest')} /> : null}
          {items.map((p) => (
            <PostCard key={p.id} post={p} showCommunity={false} onPress={() => router.push(`/posts/${p.id}`)} onMenu={() => setMenu(p)}
              onLike={() => run(() => (p.liked ? CommunityApi.unlike(p.id) : CommunityApi.like(p.id)))} />
          ))}
          {posts.hasNextPage ? <Button variant="ghost" small title={t('common.loadMore')} onPress={() => posts.fetchNextPage()} loading={posts.isFetchingNextPage} /> : null}
        </>
      ) : null}

      <ActionMenu
        visible={Boolean(menu)} onClose={() => setMenu(null)}
        title={menu === 'group' ? c?.name : menu?.author?.displayName}
        actions={
          menu === 'group' ? [
            { label: t('safety.reportGroup'), icon: 'flag-outline', onPress: () => router.push(`/report?type=community&id=${id}`) },
            ...(isMember ? [{ label: t('community.leave'), icon: 'exit-outline', danger: true, onPress: leave }] : []),
          ] : menu ? (menu.mine || c?.myRole === 'admin' || c?.myRole === 'moderator' ? [
            { label: t('community.deletePost'), icon: 'trash-outline', danger: true, onPress: () => confirmAction(t('community.deletePost'), '', t('common.delete'), () => run(() => CommunityApi.deletePost(menu.id))) },
            ...(!menu.mine ? [{ label: t('safety.report'), icon: 'flag-outline', onPress: () => router.push(`/report?type=post&id=${menu.id}`) }] : []),
          ] : [
            { label: t('safety.report'), icon: 'flag-outline', onPress: () => router.push(`/report?type=post&id=${menu.id}`) },
            { label: t('safety.block'), icon: 'ban-outline', danger: true, onPress: () => confirmAction(t('safety.blockTitle', { name: menu.author.displayName }), t('safety.blockBody'), t('safety.block'), () => run(() => SafetyApi.block(menu.author.id))) },
          ]) : []
        }
      />
    </Screen>
  );
}

// Members only: non-members are sent to the unlock screen.
export default function GroupDetail() {
  return (
    <RequireCommunity>
      <GroupDetailScreen />
    </RequireCommunity>
  );
}
