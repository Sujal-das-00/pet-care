import { useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, Chip, EmptyState, ErrorNote, Field, Gap, Row, Screen, SectionHeader } from '../../components/ui';
import { ActionMenu, CATEGORY_EMOJI } from '../../components/community';
import { usePetSelection } from '../../state/PetContext';
import { EventApi, SafetyApi } from '../../api/resources';
import { useEvent, useParticipants, useRefreshCommunity } from '../../hooks/useCommunity';
import { colors, space } from '../../theme';
import { errMsg, fmtDate, fmtTime } from '../../utils/format';
import { prefName } from '../../utils/prefectures';
import { confirmAction } from '../../utils/confirm';
import { RequireCommunity } from '../../components/Paywall';

function EventDetailScreen() {
  const { id } = useLocalSearchParams();
  const { t } = useTranslation();
  const router = useRouter();
  const refresh = useRefreshCommunity();
  const { pets } = usePetSelection();
  const query = useEvent(id);
  const people = useParticipants(id);
  const e = query.data?.event;
  const [picked, setPicked] = useState(null); // null = default (all eligible pets)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [completing, setCompleting] = useState(false);
  const [attended, setAttended] = useState('');
  const [note, setNote] = useState('');

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try { await fn(); refresh(); } catch (err) { setError(errMsg(err, t)); } finally { setBusy(false); }
  };

  if (query.isError) return <Screen><EmptyState icon="alert-circle-outline" title={t('events.gone')} action={<Button small title={t('common.back')} onPress={() => router.back()} />} /></Screen>;
  if (!e) return <Screen><View /></Screen>;

  const eligible = pets.filter((p) => e.petTypes.includes(p.species));
  const chosen = picked ?? eligible.map((p) => p.id);
  const open = e.status === 'scheduled' && new Date(e.startsAt) > new Date();
  const started = e.status === 'scheduled' && new Date(e.startsAt) <= new Date();
  const full = e.spotsLeft === 0 && e.myStatus !== 'going';

  return (
    <Screen padBottom={60} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={refresh} tintColor={colors.green} />}>
      <Stack.Screen options={{ title: t('events.detailTitle'), headerRight: e.isHost ? undefined : () => (
        <Pressable onPress={() => setMenu(true)} hitSlop={10}><Ionicons name="ellipsis-horizontal" size={24} color={colors.ink} /></Pressable>
      ) }} />

      <Card tint={colors.lavender}>
        <Row gap={6} style={{ flexWrap: 'wrap', marginBottom: 8 }}>
          <Chip label={`${CATEGORY_EMOJI[e.category]} ${t(`events.cat.${e.category}`)}`} tint={colors.surface} ink={colors.lavenderInk} />
          {e.status !== 'scheduled' ? <Chip label={t(`events.status.${e.status}`)} tint={colors.pink} ink={colors.danger} /> : null}
          {e.myStatus === 'going' ? <Chip label={t('events.going')} icon="checkmark" /> : null}
        </Row>
        <AppText variant="display">{e.title}</AppText>
        <Gap h={10} />
        <Row gap={10}><Ionicons name="calendar" size={18} color={colors.lavenderInk} /><AppText style={{ color: colors.ink }}>{fmtDate(e.startsAt)} · {fmtTime(e.startsAt)}–{fmtTime(e.endsAt)}</AppText></Row>
        <Row gap={10} align="flex-start" style={{ marginTop: 6 }}><Ionicons name="location" size={18} color={colors.lavenderInk} /><AppText style={{ color: colors.ink, flex: 1 }}>{e.place.name}{e.place.city ? `, ${e.place.city}` : ''}{e.place.prefecture ? ` · ${prefName(e.place.prefecture)}` : ''}</AppText></Row>
        <Row gap={10} style={{ marginTop: 6 }}><Ionicons name="person" size={18} color={colors.lavenderInk} /><AppText style={{ color: colors.ink }}>{t('events.hostedBy', { name: e.host.displayName || t('community.someone') })}</AppText></Row>
        {e.community ? (
          <Pressable onPress={() => router.push(`/groups/${e.community.id}`)} style={{ marginTop: 6 }}>
            <Row gap={10}><Ionicons name="people" size={18} color={colors.lavenderInk} /><AppText style={{ color: colors.lavenderInk, fontFamily: 'Nunito_700Bold' }}>{e.community.emoji} {e.community.name}</AppText></Row>
          </Pressable>
        ) : null}
        <Row gap={10} style={{ marginTop: 6 }}><Ionicons name="paw" size={18} color={colors.lavenderInk} /><AppText style={{ color: colors.ink }}>{e.petTypes.map((p) => t(`pet.species.${p}`)).join(' · ')}</AppText></Row>
      </Card>
      <Gap h={space.md} />
      <ErrorNote message={error} />

      {e.status === 'cancelled' ? <Card tint={colors.pink} style={{ marginBottom: 12 }}><AppText variant="h3">{t('events.cancelledNote')}</AppText>{e.cancelReason ? <AppText variant="small">{e.cancelReason}</AppText> : null}</Card> : null}
      {e.status === 'completed' ? <Card tint={colors.greenSoft} style={{ marginBottom: 12 }}><AppText variant="h3">{t('events.completedNote', { count: e.completion?.attended ?? 0 })}</AppText>{e.completion?.note ? <AppText variant="small">{e.completion.note}</AppText> : null}</Card> : null}

      {/* RSVP */}
      {!e.isHost && open ? (
        <Card style={{ marginBottom: 12 }}>
          <AppText variant="h3">{t('events.goingCount', { count: e.goingCount })}{e.spotsLeft != null ? ` · ${e.spotsLeft === 0 ? t('events.full') : t('events.spotsLeft', { count: e.spotsLeft })}` : ''}</AppText>
          {e.myStatus !== 'going' && eligible.length ? (
            <>
              <AppText variant="small" style={{ marginVertical: 8 }}>{t('events.bringWho')}</AppText>
              <Row gap={8} style={{ flexWrap: 'wrap' }}>
                {eligible.map((p) => (
                  <Chip key={p.id} label={`${p.species === 'cat' ? '🐱' : '🐶'} ${p.name}`} selected={chosen.includes(p.id)}
                    onPress={() => setPicked(chosen.includes(p.id) ? chosen.filter((x) => x !== p.id) : [...chosen, p.id])} />
                ))}
              </Row>
            </>
          ) : null}
          <Gap h={12} />
          {e.myStatus === 'going'
            ? <Button variant="ghost" title={t('events.leave')} loading={busy} onPress={() => run(() => EventApi.leave(id))} />
            : <Button title={full ? t('events.full') : t('events.join')} disabled={full} loading={busy} onPress={() => run(() => EventApi.rsvp(id, e.petTypes.length ? chosen.filter((x) => eligible.some((p) => p.id === x)) : []))} />}
          {e.myStatus === 'going' ? <AppText variant="tiny" style={{ marginTop: 8 }}>{t('events.reminderNote')}</AppText> : null}
        </Card>
      ) : null}

      {/* Host tools */}
      {e.isHost && e.status === 'scheduled' ? (
        <Card style={{ marginBottom: 12 }}>
          <AppText variant="h3">{t('events.hostTools')}</AppText>
          <AppText variant="small" style={{ marginBottom: 10 }}>{t('events.goingCount', { count: e.goingCount })}{e.spotsLeft != null ? ` · ${t('events.spotsLeft', { count: e.spotsLeft })}` : ''}</AppText>
          {started ? (
            completing ? (
              <>
                <Field label={t('events.attended')} value={attended} onChangeText={(v) => setAttended(v.replace(/\D/g, ''))} keyboardType="number-pad" />
                <Field label={t('events.completionNote')} value={note} onChangeText={setNote} multiline maxLength={500} />
                <Button title={t('events.reportDone')} loading={busy} disabled={attended === ''} onPress={() => run(async () => { await EventApi.complete(id, { attended: Number(attended), note }); setCompleting(false); })} />
              </>
            ) : <Button variant="soft" icon="checkmark-done" title={t('events.reportDone')} onPress={() => setCompleting(true)} />
          ) : null}
          <Gap h={8} />
          {cancelling ? (
            <>
              <Field label={t('events.cancelReason')} value={reason} onChangeText={setReason} maxLength={300} />
              <Button variant="danger" title={t('events.cancelConfirm')} loading={busy} onPress={() => run(async () => { await EventApi.cancel(id, reason); setCancelling(false); })} />
            </>
          ) : <Button variant="danger" title={t('events.cancel')} onPress={() => setCancelling(true)} />}
        </Card>
      ) : null}

      {e.description ? <><SectionHeader title={t('events.about')} icon="information-circle-outline" /><AppText style={{ color: colors.ink }}>{e.description}</AppText></> : null}
      {e.instructions ? <><SectionHeader title={t('events.howTo')} icon="reader-outline" /><AppText style={{ color: colors.ink }}>{e.instructions}</AppText></> : null}

      <SectionHeader title={t('events.whoGoing')} icon="people-outline" />
      {(people.data?.items ?? []).map((p) => (
        <Row key={p.user?.id} gap={10} style={{ marginBottom: 8 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontFamily: 'Nunito_800ExtraBold', color: colors.greenDark }}>{(p.user?.displayName || '?').slice(0, 1).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <AppText variant="h3">{p.user?.displayName || t('community.someone')} {p.isHost ? `· ${t('events.hostBadge')}` : ''}</AppText>
            {p.pets.length ? <AppText variant="small">{p.pets.map((x) => `${x.species === 'cat' ? '🐱' : '🐶'} ${x.name}`).join('  ')}</AppText> : null}
          </View>
        </Row>
      ))}

      <Card tint={colors.greenSoft} style={{ marginTop: space.lg }}>
        <Row gap={10} align="flex-start"><Ionicons name="shield-checkmark" size={20} color={colors.greenDark} /><AppText variant="small" style={{ flex: 1, color: colors.ink }}>{t('events.safetyNote')}</AppText></Row>
      </Card>

      <ActionMenu
        visible={menu} onClose={() => setMenu(false)} title={e.title}
        actions={e.isHost ? [] : [
          { label: t('safety.reportEvent'), icon: 'flag-outline', onPress: () => router.push(`/report?type=event&id=${id}`) },
          { label: t('safety.reportHost'), icon: 'person-remove-outline', onPress: () => router.push(`/report?type=user&id=${e.host.id}`) },
          { label: t('safety.block'), icon: 'ban-outline', danger: true, onPress: () => confirmAction(t('safety.blockTitle', { name: e.host.displayName }), t('safety.blockBody'), t('safety.block'), async () => { await run(() => SafetyApi.block(e.host.id)); router.back(); }) },
        ]}
      />
    </Screen>
  );
}

// Members only: non-members are sent to the unlock screen.
export default function EventDetail() {
  return (
    <RequireCommunity>
      <EventDetailScreen />
    </RequireCommunity>
  );
}
