import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, ErrorNote, Gap, Row, Screen } from '../../components/ui';
import { Hero } from '../../components/pets';
import { AuthApi } from '../../api/resources';
import { useAuth } from '../../state/AuthContext';
import { isInsideNimiqPay, openInNimiqPayUrl } from '../../payments/nimiqPay';
import { colors, fonts } from '../../theme';
import { errMsg } from '../../utils/format';

function Check({ checked, onToggle, label }) {
  return (
    <Pressable onPress={onToggle} style={{ marginBottom: 12 }} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      <Row align="flex-start" gap={10}>
        <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={checked ? colors.green : colors.inkMute} />
        <AppText variant="small" style={{ flex: 1 }}>{label}</AppText>
      </Row>
    </Pressable>
  );
}

export default function SignIn() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { loginWithNimiq } = useAuth();
  const methods = useQuery({ queryKey: ['auth', 'methods'], queryFn: AuthApi.methods, retry: false });
  const [agree, setAgree] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inside = isInsideNimiqPay();

  const signIn = async () => {
    setError('');
    setBusy(true);
    try {
      const r = await loginWithNimiq({ acceptTerms: true, acceptPrivacy: true, marketingOptIn: marketing });
      if (r.cancelled) setError(t('auth.cancelled'));
    } catch (e) {
      if (/not injected/i.test(e?.message || '')) setError(t('auth.errors.provider'));
      else if (e?.code && t(`auth.errors.${e.code}`, { defaultValue: '' })) setError(t(`auth.errors.${e.code}`));
      else setError(errMsg(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen
        padBottom={insets.bottom + 24}
        header={
          <Hero height={290}>
            <View style={{ paddingTop: insets.top + 12 }}>
              <Row gap={8}>
                <Ionicons name="paw" size={26} color={colors.orange} />
                <Text style={{ fontFamily: fonts.bold, fontSize: 24, color: colors.ink }}>PawCircle</Text>
              </Row>
            </View>
          </Hero>
        }
      >
        <Gap h={24} />
        <AppText variant="display" style={{ textAlign: 'center' }}>{t('welcome.title')}</AppText>
        <Gap h={8} />
        <AppText style={{ textAlign: 'center' }}>{t('welcome.subtitle')}</AppText>
        <Gap h={24} />
        <ErrorNote message={error} />

        {inside ? (
          <>
            <Check checked={agree} onToggle={() => setAgree(!agree)} label={t('auth.acceptTerms')} />
            <Check checked={marketing} onToggle={() => setMarketing(!marketing)} label={t('auth.marketing')} />
            <Gap h={6} />
            <Button icon="wallet" title={t('auth.signInNimiq')} onPress={signIn} loading={busy} disabled={!agree} />
            <AppText variant="tiny" style={{ textAlign: 'center', marginTop: 10 }}>{t('auth.signInHint')}</AppText>
          </>
        ) : (
          <Card tint={colors.lavender}>
            <Row gap={12} align="flex-start">
              <Ionicons name="wallet" size={26} color={colors.lavenderInk} />
              <View style={{ flex: 1 }}>
                <AppText variant="h3">{t('auth.needNimiqTitle')}</AppText>
                <AppText variant="small" style={{ color: colors.ink, marginTop: 4 }}>{t('auth.needNimiqBody')}</AppText>
              </View>
            </Row>
            <Gap h={14} />
            <Button icon="open-outline" title={t('auth.openInNimiq')} onPress={() => Linking.openURL(openInNimiqPayUrl()).catch(() => setError(t('auth.cantOpen')))} />
            <AppText variant="tiny" style={{ textAlign: 'center', marginTop: 10 }}>{t('auth.installHint')}</AppText>
          </Card>
        )}

        {methods.data?.password ? (
          <Pressable onPress={() => router.push('/login')} style={{ alignItems: 'center', padding: 18 }}>
            <AppText variant="small" style={{ fontFamily: fonts.semibold, textDecorationLine: 'underline' }}>{t('auth.devSignIn')}</AppText>
          </Pressable>
        ) : null}
      </Screen>
    </View>
  );
}
