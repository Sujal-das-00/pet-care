import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, shadow, space } from '../theme';
import { AppText } from './ui';

export const speciesEmoji = (s) => (s === 'cat' ? '🐱' : '🐶');

/**
 * Illustration placeholder until the final character art is supplied: the emoji sits on a soft
 * pastel disc. Swap the body of this component for <Image source=...> when assets arrive.
 */
export function PetAvatar({ pet, size = 48, ring }) {
  const tint = pet?.species === 'cat' ? colors.lavender : colors.peach;
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }, ring && { borderWidth: 3, borderColor: colors.surface, ...shadow.card }]}>
      <Text style={{ fontSize: size * 0.55 }}>{speciesEmoji(pet?.species)}</Text>
    </View>
  );
}

/** Header hero: warm gradient-free blob + two friends, like the reference screens. */
export function Hero({ children, height = 190, compact }) {
  return (
    <View style={[styles.hero, { minHeight: height }]}>
      {compact ? <View style={styles.cloud} /> : null}
      <View style={styles.bushA} />
      <View style={styles.bushB} />
      <View style={[styles.friends, compact && { bottom: 40, right: 10 }]} pointerEvents="none">
        <Text style={{ fontSize: compact ? 58 : 84 }}>🐶</Text>
        <Text style={{ fontSize: compact ? 46 : 66, marginLeft: -16, marginTop: 14 }}>🐱</Text>
      </View>
      {children}
    </View>
  );
}

export function PetSelector({ pets, selected, onSelect }) {
  if (!pets?.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
      {pets.map((p) => {
        const active = selected?.id === p.id;
        return (
          <Pressable key={p.id} onPress={() => onSelect(p.id)} style={[styles.pill, active && styles.pillActive]}>
            <PetAvatar pet={p} size={34} />
            <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.ink }}>{p.name}</Text>
            {active && pets.length > 1 ? <Ionicons name="checkmark-circle" size={16} color={colors.green} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Stat({ icon, label, value, tint = colors.greenSoft, ink = colors.greenDark }) {
  return (
    <View style={[styles.stat, { backgroundColor: tint }]}>
      <Ionicons name={icon} size={18} color={ink} />
      <AppText variant="h3" style={{ marginTop: 6 }} numberOfLines={1}>{value}</AppText>
      <AppText variant="tiny" numberOfLines={1}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: '#FFF4E6', borderBottomLeftRadius: 36, borderBottomRightRadius: 36, paddingHorizontal: 20, paddingBottom: 18, overflow: 'hidden' },
  cloud: { position: 'absolute', top: 16, left: '66%', width: 54, height: 22, borderRadius: 14, backgroundColor: '#DCEBF0' },
  bushA: { position: 'absolute', right: -20, bottom: -18, width: 150, height: 70, borderRadius: 40, backgroundColor: '#CFE4BC' },
  bushB: { position: 'absolute', right: 100, bottom: -26, width: 110, height: 56, borderRadius: 40, backgroundColor: '#DDEBCB' },
  friends: { position: 'absolute', right: 14, bottom: 6, flexDirection: 'row', alignItems: 'flex-end' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, paddingVertical: 6, paddingHorizontal: 12, paddingRight: 16, borderRadius: radius.pill, ...shadow.card, borderWidth: 2, borderColor: 'transparent' },
  pillActive: { borderColor: colors.greenSoft },
  stat: { flex: 1, borderRadius: radius.lg, padding: space.md, minWidth: 0 },
});
