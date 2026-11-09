import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { AppText, Card, Chip, Row } from './ui';
import { colors, fonts, radius, shadow, space } from '../theme';
import { PREFECTURES, prefName } from '../utils/prefectures';
import { fmtDateTime, fmtTime } from '../utils/format';
import { DateTime } from 'luxon';

export const TINT = {
  peach: colors.peach, lavender: colors.lavender, blue: colors.blue,
  yellow: colors.yellow, green: colors.greenSoft, pink: colors.pink,
};
export const CATEGORY_EMOJI = {
  monthly_paw_walk: '🐾', picnic: '🧺', dog_park: '🐕', cat_gathering: '🐱', photo_day: '📸',
  breed_meetup: '🏅', fitness_walk: '👟', birthday: '🎂', adventure: '🥾', other: '✨',
};

/** Square-ish tile used in the "Popular communities" carousel. */
export function CommunityTile({ community, onPress }) {
  const { t } = useTranslation();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, { backgroundColor: TINT[community.tint] || colors.greenSoft }, pressed && { opacity: 0.85 }]}>
      <Text style={{ fontSize: 42 }}>{community.emoji}</Text>
      <AppText variant="h3" style={{ marginTop: 6, textAlign: 'center' }} numberOfLines={2}>{community.name}</AppText>
      <AppText variant="tiny">{t('community.memberCount', { count: community.memberCount })}</AppText>
    </Pressable>
  );
}

/** Full-width row used in lists (My Groups, Nearby, search). */
export function CommunityRow({ community, onPress, right }) {
  const { t } = useTranslation();
  return (
    <Card onPress={onPress} style={{ marginBottom: 10 }}>
      <Row gap={14}>
        <View style={[styles.rowIcon, { backgroundColor: TINT[community.tint] || colors.greenSoft }]}><Text style={{ fontSize: 28 }}>{community.emoji}</Text></View>
        <View style={{ flex: 1 }}>
          <Row gap={6}>
            <AppText variant="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{community.name}</AppText>
            {community.official ? <Ionicons name="checkmark-circle" size={16} color={colors.green} /> : null}
          </Row>
          <AppText variant="small" numberOfLines={1}>
            {t('community.memberCount', { count: community.memberCount })}{community.prefecture ? ` · ${prefName(community.prefecture)}` : ''}
          </AppText>
        </View>
        {right}
      </Row>
    </Card>
  );
}

const ago = (iso) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });
  if (mins < 60) return rtf.format(-mins, 'minute');
  if (mins < 60 * 24) return rtf.format(-Math.round(mins / 60), 'hour');
  return rtf.format(-Math.round(mins / 1440), 'day');
};

export function PostCard({ post, onPress, onLike, onMenu, showCommunity = true, onCommunity }) {
  const { t } = useTranslation();
  const initial = (post.author.displayName || '?').slice(0, 1).toUpperCase();
  return (
    <Card style={{ marginBottom: 12 }} onPress={onPress}>
      <Row gap={10} align="flex-start">
        <View style={styles.avatar}><Text style={{ fontFamily: fonts.bold, color: colors.greenDark }}>{initial}</Text></View>
        <View style={{ flex: 1 }}>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            <AppText variant="h3">{post.author.displayName || t('community.someone')}</AppText>
            {showCommunity && post.community ? <Chip label={`${post.community.emoji} ${post.community.name}`} tint={colors.lavender} ink={colors.lavenderInk} onPress={onCommunity} /> : null}
          </Row>
          <AppText variant="tiny">{ago(post.createdAt)}{post.pet ? ` · ${post.pet.species === 'cat' ? '🐱' : '🐶'} ${post.pet.name}` : ''}</AppText>
        </View>
        {onMenu ? <Pressable onPress={onMenu} hitSlop={10} accessibilityLabel={t('common.more')}><Ionicons name="ellipsis-horizontal" size={22} color={colors.inkMute} /></Pressable> : null}
      </Row>
      <AppText style={{ marginVertical: 10, color: colors.ink }}>{post.text}</AppText>
      <Row gap={22}>
        <Pressable onPress={onLike} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('community.like')}>
          <Row gap={6}><Ionicons name={post.liked ? 'heart' : 'heart-outline'} size={22} color={post.liked ? colors.danger : colors.inkSoft} /><AppText variant="h3">{post.likeCount}</AppText></Row>
        </Pressable>
        <Row gap={6}><Ionicons name="chatbubble-outline" size={20} color={colors.inkSoft} /><AppText variant="h3">{post.commentCount}</AppText></Row>
      </Row>
    </Card>
  );
}

export function EventCard({ event, onPress, compact }) {
  const { t } = useTranslation();
  const d = DateTime.fromISO(event.startsAt, { zone: 'Asia/Tokyo' }).setLocale('en');
  const closed = event.status !== 'scheduled';
  return (
    <Card onPress={onPress} style={{ marginBottom: 12 }}>
      <Row gap={14} align="flex-start">
        <View style={styles.dateBadge}>
          <AppText variant="tiny" style={{ color: colors.lavenderInk }}>{d.toFormat('MMM')}</AppText>
          <Text style={{ fontFamily: fonts.bold, fontSize: 24, color: colors.ink }}>{d.day}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Row gap={6} style={{ flexWrap: 'wrap', marginBottom: 4 }}>
            <Chip label={`${CATEGORY_EMOJI[event.category] || '✨'} ${t(`events.cat.${event.category}`)}`} tint={colors.lavender} ink={colors.lavenderInk} />
            {closed ? <Chip label={t(`events.status.${event.status}`)} tint={colors.pink} ink={colors.danger} /> : null}
            {event.myStatus === 'going' ? <Chip label={t('events.going')} icon="checkmark" /> : null}
          </Row>
          <AppText variant="h3" numberOfLines={2}>{event.title}</AppText>
          <AppText variant="small" numberOfLines={1}>🕙 {fmtTime(event.startsAt)}–{fmtTime(event.endsAt)}</AppText>
          <AppText variant="small" numberOfLines={1}>📍 {event.place.name}{event.place.prefecture ? ` · ${prefName(event.place.prefecture)}` : ''}</AppText>
          {!compact ? (
            <AppText variant="tiny" style={{ marginTop: 4 }}>
              {t('events.goingCount', { count: event.goingCount })}{event.spotsLeft != null ? ` · ${event.spotsLeft === 0 ? t('events.full') : t('events.spotsLeft', { count: event.spotsLeft })}` : ''}
            </AppText>
          ) : null}
        </View>
      </Row>
    </Card>
  );
}

export const eventWhen = (e) => fmtDateTime(e.startsAt);

/** Bottom-sheet list of actions (works the same on web and native, unlike Alert buttons). */
export function ActionMenu({ visible, onClose, title, actions }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          {title ? <AppText variant="h3" style={{ marginBottom: 8 }}>{title}</AppText> : null}
          {actions.map((a) => (
            <Pressable key={a.label} onPress={() => { onClose(); a.onPress(); }} style={styles.action}>
              <Ionicons name={a.icon} size={22} color={a.danger ? colors.danger : colors.ink} />
              <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: a.danger ? colors.danger : colors.ink }}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

/** Field-style button that opens a searchable list of the 47 prefectures. */
export function PrefecturePicker({ value, onChange, label, placeholder, allowClear }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const insets = useSafeAreaInsets();
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return PREFECTURES.filter((p) => !s || p.name.toLowerCase().includes(s));
  }, [q]);
  return (
    <View style={{ marginBottom: space.lg }}>
      {label ? <AppText variant="small" style={styles.label}>{label}</AppText> : null}
      <Pressable onPress={() => setOpen(true)} style={styles.field} accessibilityRole="button">
        <Text style={{ fontFamily: fonts.regular, fontSize: 16, color: value ? colors.ink : colors.inkMute, flex: 1 }}>{value ? prefName(value) : placeholder || t('prefecture.choose')}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.inkMute} />
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 12 }}>
          <Row style={{ paddingHorizontal: 20, justifyContent: 'space-between', marginBottom: 12 }}>
            <AppText variant="h1">{t('prefecture.title')}</AppText>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}><Ionicons name="close" size={28} color={colors.ink} /></Pressable>
          </Row>
          <TextInput value={q} onChangeText={setQ} placeholder={t('common.search')} placeholderTextColor={colors.inkMute} style={styles.search} autoCorrect={false} />
          <FlatList
            data={list}
            keyExtractor={(p) => p.code}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }}
            ListHeaderComponent={allowClear && value ? (
              <Pressable onPress={() => { onChange(''); setOpen(false); }} style={styles.pref}><Text style={[styles.prefText, { color: colors.danger }]}>{t('prefecture.clear')}</Text></Pressable>
            ) : null}
            renderItem={({ item }) => (
              <Pressable onPress={() => { onChange(item.code); setOpen(false); setQ(''); }} style={styles.pref}>
                <Text style={styles.prefText}>{item.name}</Text>
                {item.code === value ? <Ionicons name="checkmark-circle" size={20} color={colors.green} /> : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { width: 124, borderRadius: radius.xl, padding: 12, alignItems: 'center', minHeight: 150, justifyContent: 'center' },
  rowIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  dateBadge: { width: 54, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.lavender, alignItems: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(59,42,30,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, ...shadow.card },
  action: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  label: { fontFamily: fonts.semibold, color: colors.ink, marginBottom: 6, marginLeft: 4 },
  field: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: 16, paddingVertical: 14 },
  search: { marginHorizontal: 20, marginBottom: 8, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, fontFamily: fonts.regular, color: colors.ink },
  pref: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  prefText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
});
