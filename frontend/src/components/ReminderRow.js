import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, space } from '../theme';
import { AppText, Row } from './ui';
import { fmtDate, fmtTime, isOverdue, isToday } from '../utils/format';

const KIND = {
  medication: ['medkit', colors.pink, colors.danger],
  vaccination: ['shield-checkmark', colors.blue, colors.blueInk],
  appointment: ['calendar', colors.lavender, colors.lavenderInk],
  feeding: ['restaurant', colors.yellow, colors.yellowInk],
  grooming: ['cut', colors.peach, colors.peachInk],
  weight: ['scale', colors.greenSoft, colors.greenDark],
  general: ['notifications', colors.greenSoft, colors.greenDark],
  custom: ['notifications', colors.greenSoft, colors.greenDark],
};

export default function ReminderRow({ reminder, onDone, onSkip, busy }) {
  const { t } = useTranslation();
  const [icon, bg, fg] = KIND[reminder.kind] || KIND.custom;
  const overdue = reminder.isPending || isOverdue(reminder.dueAt);
  const sameDay = isToday(reminder.dueAt) || overdue;
  const when = sameDay ? fmtTime(reminder.dueAt) : `${fmtDate(reminder.dueAt)} ${fmtTime(reminder.dueAt)}`;
  const canSkip = reminder.sourceType === 'medication' && onSkip;

  return (
    <Row style={styles.row} gap={12}>
      <View style={[styles.icon, { backgroundColor: bg }]}><Ionicons name={icon} size={20} color={fg} /></View>
      <View style={{ flex: 1 }}>
        <AppText variant="h3" numberOfLines={1}>{reminder.title}</AppText>
        <AppText variant="small" numberOfLines={1} style={overdue && { color: colors.danger }}>
          {overdue ? `${t('reminders.due')} · ` : ''}{when}{reminder.body ? ` · ${reminder.body}` : ''}
        </AppText>
      </View>
      {canSkip ? (
        <Pressable disabled={busy} onPress={onSkip} hitSlop={6} style={styles.skip}>
          <Ionicons name="play-skip-forward" size={16} color={colors.inkMute} />
        </Pressable>
      ) : null}
      <Pressable accessibilityLabel={t('reminders.markDone')} disabled={busy} onPress={onDone} hitSlop={6} style={[styles.check, busy && { opacity: 0.4 }]}>
        <Ionicons name="checkmark" size={20} color="#fff" />
      </Pressable>
    </Row>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.sm },
  icon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  check: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  skip: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
