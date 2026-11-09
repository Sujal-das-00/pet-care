import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, gutter, radius, shadow, space, type } from '../theme';

/* ---------- typography ---------- */
export function AppText({ variant = 'body', style, ...rest }) {
  return <Text style={[type[variant], style]} {...rest} />;
}

/* ---------- layout ---------- */
export function Screen({ children, scroll = true, header, padBottom = 120, refreshControl, style }) {
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={{ paddingBottom: padBottom, paddingTop: header ? 0 : insets.top + space.md }}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
      keyboardShouldPersistTaps="handled"
    >
      {header}
      <View style={[{ paddingHorizontal: gutter }, style]}>{children}</View>
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, paddingTop: insets.top + space.md, paddingHorizontal: gutter }, style]}>{children}</View>
  );
  return <View style={styles.screen}>{body}</View>;
}

export function ModalScreen({ children, title, footer }) {
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: gutter, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {title ? <AppText variant="h1" style={{ marginBottom: space.lg }}>{title}</AppText> : null}
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Card({ children, tint, style, onPress, padded = true }) {
  const bg = tint ? { backgroundColor: tint } : null;
  const inner = [styles.card, padded && { padding: space.lg }, bg, style];
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [...inner, pressed && { opacity: 0.85 }]}>{children}</Pressable>;
  return <View style={inner}>{children}</View>;
}

export const Row = ({ children, style, gap = space.md, align = 'center' }) => (
  <View style={[{ flexDirection: 'row', alignItems: align, gap }, style]}>{children}</View>
);
export const Gap = ({ h = space.lg }) => <View style={{ height: h }} />;

/* ---------- controls ---------- */
export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, style, small }) {
  const v = variants[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(off) }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn, small && styles.btnSmall, { backgroundColor: v.bg, borderColor: v.border },
        off && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.98 }] }, style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : (
        <Row gap={8}>
          {icon ? <Ionicons name={icon} size={18} color={v.fg} /> : null}
          <Text style={[type.button, small && { fontSize: 14 }, { color: v.fg }]}>{title}</Text>
        </Row>
      )}
    </Pressable>
  );
}
const variants = {
  primary: { bg: colors.green, fg: '#fff', border: colors.green },
  soft: { bg: colors.greenSoft, fg: colors.greenDark, border: colors.greenSoft },
  ghost: { bg: 'transparent', fg: colors.inkSoft, border: colors.line },
  danger: { bg: '#FBE9E7', fg: colors.danger, border: '#FBE9E7' },
};

export function Chip({ label, tint = colors.greenSoft, ink = colors.greenDark, icon, onPress, selected, style }) {
  const bg = selected === undefined ? tint : selected ? colors.green : colors.surface;
  const fg = selected === undefined ? ink : selected ? '#fff' : colors.inkSoft;
  const Comp = onPress ? Pressable : View;
  return (
    <Comp onPress={onPress} style={[styles.chip, { backgroundColor: bg }, selected === false && { borderWidth: 1, borderColor: colors.line }, style]}>
      {icon ? <Ionicons name={icon} size={13} color={fg} style={{ marginRight: 4 }} /> : null}
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: fg }}>{label}</Text>
    </Comp>
  );
}

export function Field({ label, error, hint, style, multiline, ...props }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ marginBottom: space.lg }}>
      {label ? <AppText variant="small" style={styles.label}>{label}</AppText> : null}
      <TextInput
        placeholderTextColor={colors.inkMute}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        multiline={multiline}
        style={[styles.input, multiline && { minHeight: 84, textAlignVertical: 'top' }, focus && { borderColor: colors.green }, error && { borderColor: colors.danger }, style]}
        {...props}
      />
      {error ? <AppText variant="small" style={{ color: colors.danger, marginTop: 4 }}>{error}</AppText> : hint ? <AppText variant="tiny" style={{ marginTop: 4 }}>{hint}</AppText> : null}
    </View>
  );
}

/** Auto-formats digits as YYYY-MM-DD. */
export function DateField({ value, onChangeText, ...props }) {
  const fmt = (s) => {
    const d = s.replace(/\D/g, '').slice(0, 8);
    return [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)].filter(Boolean).join('-');
  };
  return <Field keyboardType="number-pad" placeholder="YYYY-MM-DD" value={value} onChangeText={(s) => onChangeText(fmt(s))} maxLength={10} {...props} />;
}

/** Auto-formats digits as HH:mm. */
export function TimeField({ value, onChangeText, ...props }) {
  const fmt = (s) => {
    const d = s.replace(/\D/g, '').slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
  };
  return <Field keyboardType="number-pad" placeholder="HH:mm" value={value} onChangeText={(s) => onChangeText(fmt(s))} maxLength={5} {...props} />;
}

export function Segmented({ options, value, onChange }) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segItem, active && styles.segActive]}>
            {o.icon ? <Ionicons name={o.icon} size={17} color={active ? '#fff' : colors.inkSoft} /> : null}
            <Text numberOfLines={1} style={{ fontFamily: fonts.semibold, fontSize: options.length > 3 ? 13 : 14, color: active ? '#fff' : colors.inkSoft }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ChoiceRow({ options, value, onChange }) {
  return (
    <Row style={{ flexWrap: 'wrap', marginBottom: space.lg }} gap={8}>
      {options.map((o) => <Chip key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />)}
    </Row>
  );
}

/* ---------- pieces ---------- */
export function SectionHeader({ title, icon = 'paw', action, onAction, iconColor = colors.green }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.md }}>
      <Row gap={8}>
        <Ionicons name={icon} size={20} color={iconColor} />
        <AppText variant="h2">{title}</AppText>
      </Row>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Row gap={4}><Text style={styles.link}>{action}</Text><Ionicons name="arrow-forward" size={15} color={colors.green} /></Row>
        </Pressable>
      ) : null}
    </Row>
  );
}

export function ProgressBar({ value, max = 1, color = colors.green }) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  return (
    <View style={styles.track}><View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: color }]} /></View>
  );
}

export function EmptyState({ icon = 'paw-outline', title, body, action }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={26} color={colors.green} /></View>
      <AppText variant="h3" style={{ textAlign: 'center' }}>{title}</AppText>
      {body ? <AppText variant="small" style={{ textAlign: 'center', marginTop: 4 }}>{body}</AppText> : null}
      {action ? <View style={{ marginTop: space.md }}>{action}</View> : null}
    </View>
  );
}

export function DemoRibbon({ label = 'DEMO DATA' }) {
  return <View style={styles.ribbon}><Text style={styles.ribbonText}>{label}</Text></View>;
}

export function ErrorNote({ message }) {
  if (!message) return null;
  return (
    <View style={styles.errorBox}>
      <Ionicons name="alert-circle" size={18} color={colors.danger} />
      <AppText variant="small" style={{ color: colors.danger, flex: 1 }}>{message}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  footer: { padding: gutter, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, ...shadow.card },
  btn: { minHeight: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, borderWidth: 1 },
  btnSmall: { minHeight: 40, paddingHorizontal: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, alignSelf: 'flex-start' },
  label: { fontFamily: fonts.semibold, color: colors.ink, marginBottom: 6, marginLeft: 4 },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, fontFamily: fonts.regular, color: colors.ink },
  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 6, ...shadow.card },
  segItem: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, paddingHorizontal: 6, borderRadius: radius.pill },
  segActive: { backgroundColor: colors.green },
  link: { fontFamily: fonts.semibold, color: colors.green, fontSize: 14 },
  track: { height: 12, borderRadius: 8, backgroundColor: colors.greenTrack, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 8 },
  empty: { alignItems: 'center', padding: space.xl, backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line },
  emptyIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.md },
  ribbon: { position: 'absolute', top: 10, right: 10, backgroundColor: '#FFE9A8', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, zIndex: 5 },
  ribbonText: { fontFamily: fonts.bold, fontSize: 9.5, color: '#7A5A00', letterSpacing: 0.6 },
  errorBox: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#FBE9E7', padding: 12, borderRadius: radius.md, marginBottom: space.lg },
});
