import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, EmptyState, ErrorNote } from '../components/ui';
import { ActionMenu } from '../components/community';
import { RequireCommunity } from '../components/Paywall';
import { useAuth } from '../state/AuthContext';
import { useChatRoom } from '../hooks/useChat';
import { SafetyApi } from '../api/resources';
import { colors, fonts, radius } from '../theme';
import { errMsg, fmtShort, fmtTime } from '../utils/format';
import { confirmAction } from '../utils/confirm';

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

function Bubble({ m, mine, onMenu }) {
  const { t } = useTranslation();
  return (
    <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', marginBottom: 8 }}>
      {!mine ? <AppText variant="tiny" style={{ marginLeft: 10, marginBottom: 2 }}>{m.author.displayName || '—'}</AppText> : null}
      <View style={{ alignItems: 'flex-end', gap: 6, flexDirection: mine ? 'row-reverse' : 'row' }}>
        <View style={{ backgroundColor: mine ? colors.green : colors.surface, borderRadius: radius.lg, borderBottomRightRadius: mine ? 6 : radius.lg, borderBottomLeftRadius: mine ? radius.lg : 6, paddingHorizontal: 14, paddingVertical: 9 }}>
          <Text selectable style={{ fontFamily: fonts.regular, fontSize: 15.5, lineHeight: 21, color: mine ? '#fff' : colors.ink }}>{m.text}</Text>
        </View>
        <Pressable onPress={onMenu} hitSlop={8} accessibilityLabel={t('common.more')} style={{ paddingBottom: 6 }}><Ionicons name="ellipsis-horizontal" size={16} color={colors.inkMute} /></Pressable>
      </View>
      <AppText variant="tiny" style={{ marginHorizontal: 10, marginTop: 2, alignSelf: mine ? 'flex-end' : 'flex-start' }}>{fmtTime(m.createdAt)}</AppText>
    </View>
  );
}

function ChatRoom() {
  const { room } = useLocalSearchParams();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const chat = useChatRoom(room);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(null);
  const scroller = useRef(null);
  const count = useRef(0);

  // Keep the newest message in view when something arrives at the bottom.
  useEffect(() => {
    if (chat.messages.length > count.current) setTimeout(() => scroller.current?.scrollToEnd({ animated: count.current > 0 }), 50);
    count.current = chat.messages.length;
  }, [chat.messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true); setError('');
    try { await chat.send(body); setText(''); } catch (e) { setError(e.status === 429 ? e.message : errMsg(e, t)); } finally { setBusy(false); }
  };

  const info = chat.info;
  const live = chat.status === 'live';
  const mineMsg = menu && menu.author.id === user.id;

  if (chat.error && !chat.messages.length && !chat.loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 20, justifyContent: 'center' }}>
        <EmptyState icon="lock-closed-outline" title={t('chat.cannotEnter')} body={chat.error.status === 403 ? chat.error.message : errMsg(chat.error, t)} action={<Button small title={t('common.back')} onPress={() => router.back()} />} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: info ? `${info.emoji} ${info.title}` : t('chat.title'), headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 8 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: live ? colors.green : colors.gold }} />
          <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.inkSoft }}>{live ? t('chat.live') : t('chat.connecting')}</Text>
        </View>
      ) }} />

      <ScrollView ref={scroller} contentContainerStyle={{ padding: 16, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
        {chat.hasOlder ? <Button small variant="ghost" title={t('common.loadMore')} onPress={chat.loadOlder} style={{ alignSelf: 'center', marginBottom: 12 }} /> : null}
        {!chat.messages.length && !chat.loading ? <EmptyState icon="chatbubbles-outline" title={t('chat.emptyTitle')} body={t('chat.emptyBody')} /> : null}
        {chat.messages.map((m, i) => (
          <View key={m.id}>
            {i === 0 || !sameDay(chat.messages[i - 1].createdAt, m.createdAt) ? <AppText variant="tiny" style={{ textAlign: 'center', marginVertical: 8 }}>{fmtShort(m.createdAt)}</AppText> : null}
            <Bubble m={m} mine={m.author.id === user.id} onMenu={() => setMenu(m)} />
          </View>
        ))}
      </ScrollView>

      <ErrorNote message={error} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, paddingBottom: Math.max(insets.bottom, 12), borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg }}>
        <TextInput value={text} onChangeText={setText} placeholder={t('chat.placeholder')} placeholderTextColor={colors.inkMute} multiline maxLength={500}
          onSubmitEditing={Platform.OS === 'web' ? send : undefined}
          style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 10, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, maxHeight: 110, outlineStyle: 'none' }} />
        <Button small icon="send" title={t('chat.send')} onPress={send} loading={busy} disabled={!text.trim()} />
      </View>

      <ActionMenu
        visible={Boolean(menu)} onClose={() => setMenu(null)} title={menu?.author?.displayName}
        actions={menu ? (mineMsg ? [
          { label: t('chat.delete'), icon: 'trash-outline', danger: true, onPress: () => chat.remove(menu.id).catch((e) => setError(errMsg(e, t))) },
        ] : [
          { label: t('safety.report'), icon: 'flag-outline', onPress: () => router.push(`/report?type=message&id=${menu.id}`) },
          { label: t('safety.block'), icon: 'ban-outline', danger: true, onPress: () => confirmAction(t('safety.blockTitle', { name: menu.author.displayName }), t('safety.blockBody'), t('safety.block'), async () => { try { await SafetyApi.block(menu.author.id); router.back(); } catch (e) { setError(errMsg(e, t)); } }) },
        ]) : []}
      />
    </KeyboardAvoidingView>
  );
}

export default function ChatRoomScreen() {
  return <RequireCommunity><ChatRoom /></RequireCommunity>;
}
