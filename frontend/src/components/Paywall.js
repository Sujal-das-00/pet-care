import { ActivityIndicator, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, Chip, Gap, Row } from './ui';
import { useCommunityAccess, useMembership } from '../hooks/useMembership';
import { colors, space } from '../theme';

const BENEFITS = [
  ['people', 'paywall.b1'],
  ['chatbubbles', 'paywall.b2'],
  ['calendar', 'paywall.b3'],
  ['location', 'paywall.b4'],
];

/** What a non-member sees in place of the community: what they get, the price, and one button. */
export function CommunityPaywall() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data } = useMembership();
  const nim = data?.price?.nim ?? 1;

  return (
    <Card tint={colors.lavender} style={{ marginTop: space.lg }}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="lock-closed" size={30} color={colors.lavenderInk} />
        </View>
        <AppText variant="h1" style={{ textAlign: 'center', marginTop: 12 }}>{t('paywall.title')}</AppText>
        <AppText style={{ textAlign: 'center', marginTop: 6, color: colors.ink }}>{t('paywall.subtitle')}</AppText>
      </View>
      <Gap h={16} />
      {BENEFITS.map(([icon, key]) => (
        <Row key={key} gap={12} style={{ marginBottom: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon} size={18} color={colors.lavenderInk} />
          </View>
          <AppText style={{ flex: 1, color: colors.ink }}>{t(key)}</AppText>
        </Row>
      ))}
      <Row gap={8} style={{ justifyContent: 'center', marginVertical: 12 }}>
        <Chip label={t('paywall.price', { nim })} tint={colors.surface} ink={colors.lavenderInk} icon="diamond" />
        <Chip label={data?.price?.oneTime === false ? t('paywall.recurring', { days: data.price.days }) : t('paywall.oneTime')} tint={colors.surface} ink={colors.lavenderInk} />
      </Row>
      <Button icon="wallet" title={t('paywall.cta')} onPress={() => router.push('/unlock')} />
      <AppText variant="tiny" style={{ textAlign: 'center', marginTop: 10 }}>{t('paywall.freeNote')}</AppText>
    </Card>
  );
}

/**
 * Wraps a screen that only members may see. While the server's answer is loading it shows a spinner;
 * for non-members it sends them to the unlock screen instead of showing a screen full of errors.
 */
export function RequireCommunity({ children }) {
  const { loading, locked } = useCommunityAccess();
  if (loading) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}><ActivityIndicator color={colors.green} /></View>;
  if (locked) return <Redirect href="/unlock" />;
  return children;
}
