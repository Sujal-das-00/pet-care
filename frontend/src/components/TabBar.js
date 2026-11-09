import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, shadow } from '../theme';

const ICONS = {
  home: ['home-outline', 'home'],
  community: ['people-outline', 'people'],
  activities: ['trophy-outline', 'trophy'],
  pet: ['paw-outline', 'paw'],
};
const ORDER = ['home', 'community', 'PAW', 'activities', 'pet'];

/** Bottom bar with the prominent central paw-plus quick-action button. */
export default function TabBar({ state }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const activeName = state.routes[state.index]?.name;

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {ORDER.map((name) => {
        if (name === 'PAW') {
          return (
            <View key="paw" style={styles.pawSlot}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('quick.title')} onPress={() => router.push('/quick')} style={({ pressed }) => [styles.paw, pressed && { transform: [{ scale: 0.96 }] }]}>
                <Ionicons name="paw" size={34} color="#fff" />
                <View style={styles.plus}><Ionicons name="add" size={14} color={colors.green} /></View>
              </Pressable>
            </View>
          );
        }
        const active = activeName === name;
        const [off, on] = ICONS[name];
        return (
          <Pressable
            key={name}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => { if (!active) router.navigate(`/${name}`); }}
            style={styles.item}
          >
            <View style={[styles.pill, active && styles.pillActive]}>
              <Ionicons name={active ? on : off} size={24} color={active ? colors.green : colors.inkSoft} />
              <Text style={[styles.label, active && { color: colors.greenDark, fontFamily: fonts.bold }]} numberOfLines={1}>{t(`tabs.${name}`)}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: '#FFFDFA', borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 10, paddingHorizontal: 6, position: 'absolute', left: 0, right: 0, bottom: 0, ...shadow.card, shadowOffset: { width: 0, height: -4 } },
  item: { flex: 1, alignItems: 'center' },
  pill: { alignItems: 'center', gap: 2, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 18, minWidth: 66 },
  pillActive: { backgroundColor: colors.greenSoft },
  label: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.inkSoft },
  pawSlot: { width: 88, alignItems: 'center' },
  paw: { width: 74, height: 74, borderRadius: 37, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', marginTop: -34, borderWidth: 5, borderColor: '#FFFDFA', ...shadow.float },
  plus: { position: 'absolute', bottom: 16, right: 15, width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
