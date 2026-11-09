import { Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, EmptyState, Row, Screen, SectionHeader } from '../components/ui';
import { RequireCommunity } from '../components/Paywall';
import { ChatApi } from '../api/resources';
import { useAuth } from '../state/AuthContext';
import { colors } from '../theme';
import { fmtShort, fmtTime } from '../utils/format';

function RoomRow({ room, onPress }) {
  const { t } = useTranslation();
  const last = room.lastMessage;
  return (
    <Card onPress={onPress} style={{ marginBottom: 10 }}>
      <Row gap={14}>
        <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 26 }}>{room.emoji}</Text></View>
        <View style={{ flex: 1 }}>
          <AppText variant="h3" numberOfLines={1}>{room.title}</AppText>
          <AppText variant="small" numberOfLines={1}>{last ? last.text : t(`chat.sub.${room.type}`)}</AppText>
        </View>
        {last ? <AppText variant="tiny">{new Date(last.at).toDateString() === new Date().toDateString() ? fmtTime(last.at) : fmtShort(last.at)}</AppText> : null}
        <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
      </Row>
    </Card>
  );
}

function ChatRooms() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['chat', 'rooms'], queryFn: ChatApi.rooms, refetchInterval: 20_000 });
  const rooms = q.data?.items ?? [];
  const open = (r) => router.push(`/chat-room?room=${encodeURIComponent(r.room)}`);
  const of = (type) => rooms.filter((r) => r.type === type);

  return (
    <Screen padBottom={40}>
      <Stack.Screen options={{ title: t('chat.title') }} />
      <AppText variant="small" style={{ marginBottom: 4 }}>{t('chat.intro')}</AppText>

      <SectionHeader title={t('chat.global')} icon="earth" />
      {of('global').map((r) => <RoomRow key={r.room} room={r} onPress={() => open(r)} />)}

      <SectionHeader title={t('chat.local')} icon="location" />
      {of('local').map((r) => <RoomRow key={r.room} room={r} onPress={() => open(r)} />)}
      {!of('local').length ? (
        <EmptyState icon="location-outline" title={t('chat.noAreaTitle')} body={t('chat.noAreaBody')} action={<Button small title={t('chat.setArea')} onPress={() => router.push('/settings')} />} />
      ) : null}

      <SectionHeader title={t('chat.communities')} icon="people" />
      {of('community').map((r) => <RoomRow key={r.room} room={r} onPress={() => open(r)} />)}
      {!of('community').length ? <EmptyState icon="people-outline" title={t('chat.noGroupsTitle')} body={t('chat.noGroupsBody')} /> : null}
      <AppText variant="tiny" style={{ textAlign: 'center', marginTop: 12 }}>{t('chat.rules', { name: user?.profile?.displayName || '' })}</AppText>
    </Screen>
  );
}

export default function ChatRoomsScreen() {
  return <RequireCommunity><ChatRooms /></RequireCommunity>;
}
