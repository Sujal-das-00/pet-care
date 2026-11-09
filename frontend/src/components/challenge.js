import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Card, Chip, EmptyState, ErrorNote, Row, ProgressBar } from './ui';
import { PrefecturePicker, TINT } from './community';
import { useAuth } from '../state/AuthContext';
import { useCommunities, useRefreshCommunity } from '../hooks/useCommunity';
import { useLeaderboard } from '../hooks/useChallenges';
import { colors, fonts, space } from '../theme';
import { errMsg, fmtShort } from '../utils/format';

/** "12.5 km", "40 min", "3 days", "7" — the unit depends on what the challenge measures. */
export function useScoreText() {
  const { t } = useTranslation();
  return (metric, value) => {
    const v = Math.round((Number(value) || 0) * 10) / 10;
    if (metric === 'distance_km') return `${v} km`;
    if (metric === 'activity_minutes') return t('challenges.minutes', { count: v });
    if (metric === 'active_days') return t('challenges.days', { count: v });
    return t('challenges.checkIns', { count: v });
  };
}

export function ChallengeCard({ challenge: c, onPress, style }) {
  const { t } = useTranslation();
  const score = useScoreText();
  const ended = c.status === 'ended';
  return (
    <Card onPress={onPress} tint={TINT[c.tint] || colors.lavender} style={[{ marginBottom: 12 }, style]}>
      <Row gap={14} align="flex-start">
        <View style={{ width: 54, height: 54, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 28 }}>{c.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Row gap={6} style={{ flexWrap: 'wrap', marginBottom: 4 }}>
            <Chip label={t(`challenges.status.${c.status}`)} tint={c.status === 'active' ? colors.green : colors.surface} ink={c.status === 'active' ? '#fff' : colors.inkSoft} />
            {c.joined ? <Chip label={t('challenges.joined')} icon="checkmark" /> : null}
          </Row>
          <AppText variant="h2" numberOfLines={2}>{c.title}</AppText>
          <AppText variant="small">{fmtShort(c.startsOn)} – {fmtShort(c.endsOn)} · {t('challenges.participants', { count: c.participantCount })}</AppText>
        </View>
      </Row>
      {c.joined && !ended ? (
        <View style={{ marginTop: 12 }}>
          <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <AppText variant="small" style={{ color: colors.ink }}>{t('challenges.yourScore')}</AppText>
            <AppText variant="h3">{score(c.metric, c.myScore)}{c.goal ? ` / ${score(c.metric, c.goal)}` : ''}</AppText>
          </Row>
          {c.goal ? <ProgressBar value={c.myScore} max={c.goal} /> : null}
        </View>
      ) : null}
      {ended && c.joined ? <AppText variant="small" style={{ marginTop: 10, color: colors.ink }}>{t('challenges.finalScore', { score: score(c.metric, c.myScore) })}</AppText> : null}
    </Card>
  );
}

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

function Row3({ item, metric, score }) {
  return (
    <Row gap={12} style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, backgroundColor: item.isMe ? colors.greenSoft : 'transparent' }}>
      <View style={{ width: 36, alignItems: 'center' }}>
        {MEDAL[item.rank] ? <Text style={{ fontSize: 24 }}>{MEDAL[item.rank]}</Text> : <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.inkSoft }}>{item.rank}</Text>}
      </View>
      <AppText variant="h3" style={{ flex: 1 }} numberOfLines={1}>{item.user.displayName || '—'}{item.isMe ? ' ·  you' : ''}</AppText>
      <AppText variant="h3" style={{ color: colors.greenDark }}>{score(metric, item.score)}</AppText>
    </Row>
  );
}

/**
 * Rankings for one challenge. Scope: everyone, people in my area, or members of one of my communities.
 * Species: dogs and cats are ranked separately on request, so different pets aren't pitted against each other.
 */
export function LeaderboardView({ challengeId, limit = 50 }) {
  const { t } = useTranslation();
  const score = useScoreText();
  const { user, updateMe } = useAuth();
  const refreshCommunity = useRefreshCommunity();
  const [scope, setScope] = useState('global');
  const [species, setSpecies] = useState(undefined);
  const [communityId, setCommunityId] = useState(null);
  const [err, setErr] = useState('');
  const pref = user?.profile?.prefecture || '';
  const mine = useCommunities({ scope: 'mine', limit: 30 }, scope === 'community');
  const communities = mine.data?.items ?? [];
  const activeCommunity = communityId || communities[0]?.id || null;

  const needsArea = scope === 'local' && !pref;
  const needsCommunity = scope === 'community' && !activeCommunity;
  const filters = { scope, species, limit, ...(scope === 'community' ? { communityId: activeCommunity } : {}), skip: needsArea || needsCommunity };
  const q = useLeaderboard(challengeId, filters);
  const board = q.data;

  return (
    <View>
      <Row gap={8} style={{ flexWrap: 'wrap', marginBottom: 10 }}>
        {['global', 'local', 'community'].map((s) => <Chip key={s} label={t(`leaderboard.scope.${s}`)} selected={scope === s} onPress={() => setScope(s)} />)}
      </Row>
      <Row gap={8} style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        <Chip label={t('leaderboard.allPets')} selected={!species} onPress={() => setSpecies(undefined)} />
        <Chip label={`🐶 ${t('leaderboard.dogs')}`} selected={species === 'dog'} onPress={() => setSpecies('dog')} />
        <Chip label={`🐱 ${t('leaderboard.cats')}`} selected={species === 'cat'} onPress={() => setSpecies('cat')} />
      </Row>
      {scope === 'community' && communities.length ? (
        <Row gap={8} style={{ flexWrap: 'wrap', marginBottom: 12 }}>
          {communities.map((c) => <Chip key={c.id} label={`${c.emoji} ${c.name}`} selected={activeCommunity === c.id} onPress={() => setCommunityId(c.id)} />)}
        </Row>
      ) : null}
      <ErrorNote message={err} />

      {needsArea ? (
        <Card tint={colors.yellow}>
          <AppText variant="small" style={{ color: colors.ink, marginBottom: 8 }}>{t('leaderboard.chooseArea')}</AppText>
          <PrefecturePicker value="" onChange={async (code) => { try { await updateMe({ profile: { prefecture: code } }); refreshCommunity(); } catch (e) { setErr(errMsg(e, t)); } }} />
        </Card>
      ) : needsCommunity ? (
        <EmptyState icon="people-outline" title={t('leaderboard.noCommunityTitle')} body={t('leaderboard.noCommunityBody')} />
      ) : q.isLoading ? null : q.isError ? (
        <ErrorNote message={errMsg(q.error, t)} />
      ) : !board?.items?.length ? (
        <EmptyState icon="podium-outline" title={t('leaderboard.emptyTitle')} body={t('leaderboard.emptyBody')} />
      ) : (
        <Card padded={false} style={{ paddingVertical: space.sm, paddingHorizontal: space.sm }}>
          {board.items.map((it) => <Row3 key={it.user.id} item={it} metric={board.challenge.metric} score={score} />)}
          {board.me && !board.items.some((i) => i.isMe) ? (
            <>
              <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 6 }} />
              <Row3 item={board.me} metric={board.challenge.metric} score={score} />
            </>
          ) : null}
        </Card>
      )}
      {board?.challenge?.status === 'ended' ? <AppText variant="tiny" style={{ marginTop: 8, textAlign: 'center' }}>{t('leaderboard.final')}</AppText> : null}
    </View>
  );
}
