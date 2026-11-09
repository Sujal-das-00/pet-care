import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, EmptyState, ErrorNote, Gap, Row, Screen } from '../../components/ui';
import { ActionMenu, PostCard } from '../../components/community';
import { CommunityApi, SafetyApi } from '../../api/resources';
import { useComments, usePost, useRefreshCommunity } from '../../hooks/useCommunity';
import { colors, fonts, radius } from '../../theme';
import { errMsg } from '../../utils/format';
import { confirmAction } from '../../utils/confirm';
import { RequireCommunity } from '../../components/Paywall';

function PostDetailScreen() {
  const { id } = useLocalSearchParams();
  const { t } = useTranslation();
  const router = useRouter();
  const refresh = useRefreshCommunity();
  const post = usePost(id);
  const comments = useComments(id);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);
  const p = post.data?.post;

  const run = async (fn) => {
    setError('');
    try { await fn(); refresh(); } catch (e) { setError(errMsg(e, t)); }
  };
  const send = async () => {
    setBusy(true);
    await run(async () => { await CommunityApi.addComment(id, text.trim()); setText(''); });
    setBusy(false);
  };

  if (post.isError) {
    return <Screen><EmptyState icon="alert-circle-outline" title={t('community.postGone')} action={<Button small title={t('common.back')} onPress={() => router.back()} />} /></Screen>;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Screen padBottom={24}>
        <Stack.Screen options={{ title: t('community.postTitle') }} />
        {p ? (
          <>
            <PostCard post={p} onLike={() => run(() => (p.liked ? CommunityApi.unlike(p.id) : CommunityApi.like(p.id)))} onMenu={() => setMenu(true)} onCommunity={() => router.push(`/groups/${p.communityId}`)} />
            <ErrorNote message={error} />
            <AppText variant="h3" style={{ marginBottom: 8 }}>{t('community.comments')}</AppText>
            {(comments.data?.items ?? []).map((c) => (
              <Card key={c.id} style={{ marginBottom: 8 }}>
                <Row style={{ justifyContent: 'space-between' }} align="flex-start">
                  <View style={{ flex: 1 }}>
                    <AppText variant="h3">{c.author.displayName || t('community.someone')}</AppText>
                    <AppText style={{ color: colors.ink }}>{c.text}</AppText>
                  </View>
                  {c.mine ? (
                    <Pressable hitSlop={8} onPress={() => run(() => CommunityApi.deleteComment(id, c.id))}><Ionicons name="trash-outline" size={18} color={colors.inkMute} /></Pressable>
                  ) : (
                    <Pressable hitSlop={8} onPress={() => router.push(`/report?type=comment&id=${c.id}`)}><Ionicons name="flag-outline" size={18} color={colors.inkMute} /></Pressable>
                  )}
                </Row>
              </Card>
            ))}
            {!(comments.data?.items ?? []).length && !comments.isLoading ? <AppText variant="small">{t('community.noComments')}</AppText> : null}
            <Gap h={12} />
            <Row gap={8} align="flex-end">
              <TextInput value={text} onChangeText={setText} placeholder={t('community.commentPh')} placeholderTextColor={colors.inkMute} multiline maxLength={500}
                style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 10, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, maxHeight: 120, outlineStyle: 'none' }} />
              <Button small title={t('community.send')} onPress={send} loading={busy} disabled={!text.trim()} />
            </Row>
          </>
        ) : null}
        <ActionMenu
          visible={menu} onClose={() => setMenu(false)} title={p?.author?.displayName}
          actions={p ? (p.mine ? [
            { label: t('community.deletePost'), icon: 'trash-outline', danger: true, onPress: () => confirmAction(t('community.deletePost'), '', t('common.delete'), async () => { await run(() => CommunityApi.deletePost(p.id)); router.back(); }) },
          ] : [
            { label: t('safety.report'), icon: 'flag-outline', onPress: () => router.push(`/report?type=post&id=${p.id}`) },
            { label: t('safety.block'), icon: 'ban-outline', danger: true, onPress: () => confirmAction(t('safety.blockTitle', { name: p.author.displayName }), t('safety.blockBody'), t('safety.block'), async () => { await run(() => SafetyApi.block(p.author.id)); router.back(); }) },
          ]) : []}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

// Members only: non-members are sent to the unlock screen.
export default function PostDetail() {
  return (
    <RequireCommunity>
      <PostDetailScreen />
    </RequireCommunity>
  );
}
