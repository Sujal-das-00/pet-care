import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText, Button, Card, Chip, EmptyState, ErrorNote, ModalScreen, Row } from '../components/ui';
import { AdminChallengeApi } from '../api/resources';
import { useAuth } from '../state/AuthContext';
import { useRefreshChallenges } from '../hooks/useChallenges';
import { colors } from '../theme';
import { errMsg, fmtShort } from '../utils/format';
import { confirmAction } from '../utils/confirm';

function AdminChallenges() {
  const { t } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const refresh = useRefreshChallenges();
  const list = useQuery({ queryKey: ['admin', 'challenges'], queryFn: AdminChallengeApi.list });
  const [error, setError] = useState('');
  const items = list.data?.items ?? [];

  const act = async (fn) => {
    setError('');
    try { await fn(); await qc.invalidateQueries({ queryKey: ['admin', 'challenges'] }); refresh(); } catch (e) { setError(errMsg(e, t)); }
  };

  return (
    <ModalScreen footer={<Button icon="add" title={t('admin.postChallenge')} onPress={() => router.push('/admin-challenge-form')} />}>
      <ErrorNote message={error} />
      {!items.length && !list.isLoading ? <EmptyState icon="trophy-outline" title={t('admin.noneTitle')} body={t('admin.noneBody')} /> : null}
      {items.map((c) => (
        <Card key={c.id} style={{ marginBottom: 10 }}>
          <Row gap={6} style={{ flexWrap: 'wrap', marginBottom: 6 }}>
            <Chip label={c.published ? t('admin.publishedChip') : t('admin.draftChip')} tint={c.published ? colors.greenSoft : colors.yellow} ink={c.published ? colors.greenDark : colors.yellowInk} />
            <Chip label={t(`challenges.status.${c.status}`)} tint={colors.lavender} ink={colors.lavenderInk} />
          </Row>
          <AppText variant="h3">{c.emoji} {c.title}</AppText>
          <AppText variant="small">{fmtShort(c.startsOn)} – {fmtShort(c.endsOn)} · {t(`admin.metric.${c.metric}`)} · {t('challenges.participants', { count: c.participantCount })}</AppText>
          <Row gap={8} style={{ marginTop: 10, flexWrap: 'wrap' }}>
            <Button small variant="soft" title={t('admin.edit')} onPress={() => router.push(`/admin-challenge-form?id=${c.id}`)} />
            <Button small variant="soft" title={c.published ? t('admin.unpublish') : t('admin.publishNow')} onPress={() => act(() => AdminChallengeApi.update(c.id, { published: !c.published }))} />
            <Button small variant="ghost" title={t('admin.entries')} onPress={() => router.push(`/admin-challenge-entries?id=${c.id}`)} />
            <Button small variant="danger" title={t('common.delete')} onPress={() => confirmAction(t('admin.deleteTitle'), c.title, t('common.delete'), () => act(() => AdminChallengeApi.remove(c.id)))} />
          </Row>
        </Card>
      ))}
    </ModalScreen>
  );
}

export default function Gate() {
  const { user } = useAuth();
  return user?.role === 'admin' ? <AdminChallenges /> : null;
}
