import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../components/ui';
import { colors, fonts, radius, shadow } from '../theme';
import { usePetSelection } from '../state/PetContext';

// `soon` actions belong to later phases; they're shown (so the IA is visible) but disabled.
const ACTIONS = [
  { key: 'walk', icon: 'walk', tint: colors.peach, ink: colors.peachInk, soon: true },
  { key: 'post', icon: 'images', tint: colors.lavender, ink: colors.lavenderInk, soon: true },
  { key: 'event', icon: 'calendar', tint: colors.blue, ink: colors.blueInk, soon: true },
  { key: 'weight', icon: 'scale', tint: colors.greenSoft, ink: colors.greenDark, to: '/weight-add' },
  { key: 'activity', icon: 'fitness', tint: colors.yellow, ink: colors.yellowInk, soon: true },
];

export default function QuickSheet() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { selected } = usePetSelection();

  const go = (a) => {
    if (a.soon) return;
    if (a.key === 'weight' && !selected) { router.replace('/pet-add'); return; }
    router.replace(a.to);
  };

  return (
    <View style={styles.root}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => router.back()} accessibilityLabel={t('common.close')} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.grab} />
        <AppText variant="h2" style={{ marginBottom: 14 }}>{t('quick.title')}</AppText>
        {ACTIONS.map((a) => (
          <Pressable key={a.key} onPress={() => go(a)} disabled={a.soon} style={({ pressed }) => [styles.item, a.soon && { opacity: 0.55 }, pressed && { backgroundColor: colors.bg }]}>
            <View style={[styles.icon, { backgroundColor: a.tint }]}><Ionicons name={a.icon} size={22} color={a.ink} /></View>
            <Text style={styles.label}>{t(`quick.${a.key}`)}</Text>
            {a.soon ? <View style={styles.soon}><Text style={styles.soonText}>{t('common.soon')}</Text></View> : <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(59,42,30,0.35)' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 10, ...shadow.card },
  grab: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 14 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 8, borderRadius: radius.lg },
  icon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  soon: { backgroundColor: colors.line, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  soonText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.inkSoft },
});
