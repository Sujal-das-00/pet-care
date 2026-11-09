import { useState } from 'react';
import { Alert, Platform, Share, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMembership } from '../hooks/useMembership';
import { useTranslation } from 'react-i18next';
import { AppText, Button, Card, Chip, ChoiceRow, ErrorNote, Field, Gap, ModalScreen, Row, SectionHeader } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { MeApi, SafetyApi } from '../api/resources';
import { PrefecturePicker } from '../components/community';
import { useBlocks, useRefreshCommunity } from '../hooks/useCommunity';
import { colors } from '../theme';
import { enablePush } from '../utils/push';
import { errMsg, fmtDateLong } from '../utils/format';

const CATS = ['care', 'fitness', 'community', 'challenges', 'events', 'marketing'];

export default function Settings() {
  const { t } = useTranslation();
  const { user, updateMe, logout } = useAuth();
  const ent = useQuery({ queryKey: ['entitlements'], queryFn: MeApi.entitlements });
  const mem = useMembership();
  const router = useRouter();
  const member = Boolean(ent.data?.membership) || ent.data?.features?.community;
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [pw, setPw] = useState('');

  const safe = (fn) => async () => { setErr(''); setMsg(''); try { await fn(); } catch (e) { setErr(errMsg(e, t)); } };

  const exportData = safe(async () => {
    const data = await MeApi.export();
    const json = JSON.stringify(data, null, 2);
    if (Platform.OS === 'web') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = 'pawcircle-export.json';
      a.click();
    } else {
      await Share.share({ message: json, title: 'PawCircle export' });
    }
  });

  const push = safe(async () => {
    const r = await enablePush();
    setMsg(t(`settings.push.${r}`));
  });

  const removeAccount = safe(async () => {
    await MeApi.deleteAccount(pw);
    await logout();
  });

  const confirmDelete = () => {
    if (Platform.OS === 'web') { setDeleting(true); return; }
    Alert.alert(t('settings.deleteTitle'), t('settings.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.continue'), style: 'destructive', onPress: () => setDeleting(true) },
    ]);
  };

  const plan = ent.data?.plan || 'explorer';
  const blocks = useBlocks();
  const refreshCommunity = useRefreshCommunity();

  return (
    <ModalScreen>
      <ErrorNote message={err} />
      {msg ? <AppText variant="small" style={{ color: colors.greenDark, marginBottom: 12 }}>{msg}</AppText> : null}

      <Card>
        <AppText variant="h2">{user?.profile?.displayName}</AppText>
        <AppText variant="small">{user?.email}</AppText>
        <Row gap={8} style={{ marginTop: 10 }}>
          <Chip label={t(`settings.plan.${plan}`)} tint={colors.greenSoft} ink={colors.greenDark} icon="ribbon" />
        </Row>
        <AppText variant="tiny" style={{ marginTop: 8 }}>{t('settings.petCareAlways')}</AppText>
      </Card>

      <SectionHeader title={t('settings.membership')} icon="diamond" />
      <Card tint={member ? colors.greenSoft : colors.lavender} style={{ marginBottom: 4 }}>
        <Row gap={12}>
          <Ionicons name={member ? 'checkmark-circle' : 'lock-closed'} size={26} color={member ? colors.greenDark : colors.lavenderInk} />
          <View style={{ flex: 1 }}>
            <AppText variant="h3">{member ? t('settings.communityActive') : t('settings.communityLocked')}</AppText>
            <AppText variant="small" style={{ color: colors.ink }}>
              {member ? (ent.data?.membership?.expiresAt ? t('settings.until', { date: fmtDateLong(ent.data.membership.expiresAt) }) : t('settings.lifetime')) : t('paywall.price', { nim: mem.data?.price?.nim ?? 1 })}
            </AppText>
          </View>
          {member ? null : <Button small title={t('paywall.unlockShort')} onPress={() => router.push('/unlock')} />}
        </Row>
      </Card>

      {user?.role === 'admin' ? (
        <>
          <SectionHeader title={t('admin.section')} icon="shield" />
          <Button variant="soft" icon="trophy" title={t('admin.manage')} onPress={() => router.push('/admin-challenges')} />
        </>
      ) : null}

      <SectionHeader title={t('settings.area')} icon="location" />
      <PrefecturePicker value={user?.profile?.prefecture || ''} allowClear onChange={(code) => safe(async () => { await updateMe({ profile: { prefecture: code } }); refreshCommunity(); })()} />
      <AppText variant="tiny" style={{ marginTop: -8, marginBottom: 8 }}>{t('onboarding.privacyNote')}</AppText>

      <SectionHeader title={t('settings.units')} icon="options" />
      <ChoiceRow value={user?.preferences?.weightUnit} onChange={(v) => safe(() => updateMe({ preferences: { weightUnit: v } }))()} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />

      <SectionHeader title={t('settings.notifications')} icon="notifications" />
      <Row gap={8} style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        {CATS.map((c) => (
          <Chip key={c} label={t(`settings.cat.${c}`)} selected={Boolean(user?.notificationPrefs?.[c])} onPress={safe(() => updateMe({ notificationPrefs: { [c]: !user?.notificationPrefs?.[c] } }))} />
        ))}
      </Row>
      <Button variant="soft" icon="notifications" title={t('settings.enablePush')} onPress={push} />

      {(blocks.data?.items ?? []).length ? (
        <>
          <SectionHeader title={t('settings.blocked')} icon="ban" />
          {blocks.data.items.map((b) => (
            <Row key={b.userId} style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <AppText variant="h3">{b.displayName || t('community.someone')}</AppText>
              <Button small variant="ghost" title={t('safety.unblock')} onPress={safe(async () => { await SafetyApi.unblock(b.userId); await blocks.refetch(); refreshCommunity(); })} />
            </Row>
          ))}
        </>
      ) : null}

      <SectionHeader title={t('settings.privacy')} icon="lock-closed" />
      <Button variant="ghost" icon="download-outline" title={t('settings.export')} onPress={exportData} />
      <Gap h={10} />
      {deleting ? (
        <Card tint="#FBE9E7">
          <AppText variant="small" style={{ marginBottom: 8, color: colors.ink }}>{t('settings.deleteBody')}</AppText>
          <Field label={t('auth.password')} value={pw} onChangeText={setPw} secureTextEntry />
          <Button variant="danger" title={t('settings.deleteConfirm')} onPress={removeAccount} disabled={!pw} />
        </Card>
      ) : (
        <Button variant="danger" title={t('settings.delete')} onPress={confirmDelete} />
      )}

      <Gap h={24} />
      <Button variant="ghost" icon="log-out-outline" title={t('settings.logout')} onPress={logout} />
    </ModalScreen>
  );
}
