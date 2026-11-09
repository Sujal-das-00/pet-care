import { useState } from 'react';
import { Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Card, EmptyState, ErrorNote, ModalScreen, Row } from '../components/ui';
import { AdminChallengeApi } from '../api/resources';
import { useAuth } from '../state/AuthContext';
import { useRefreshChallenges } from '../hooks/useChallenges';
import { colors } from '../theme';
import { errMsg, fmtShort } from '../utils/format';
import { confirmAction } from '../utils/confirm';

function Entries() {
  const { id } = useLocalSearchParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const refresh = useRefreshChallenges();
  const q = useQuery({ queryKey: ['admin', 'entries', id], queryFn: () => AdminChallengeApi.entries(id) });
  const [error, setError] = useState('');
  const items = q.data?.items ?? [];

  const remove = (e) => confirmAction(t('admin.removeEntryTitle'), `${e.displayName}: ${e.value}`, t('common.delete'), async () => {
    setError('');
    try { await AdminChallengeApi.removeEntry(e.id); await qc.invalidateQueries({ queryKey: ['admin', 'entries', id] }); refresh(); } catch (err) { setError(errMsg(err, t)); }
  });

  return (
    <ModalScreen title={t('admin.entriesTitle')}>
      <AppText variant="small" style={{ marginBottom: 12 }}>{t('admin.entriesNote', { count: q.data?.participants ?? 0 })}</AppText>
      <ErrorNote message={error} />
      {!items.length && !q.isLoading ? <EmptyState icon="list-outline" title={t('admin.noEntries')} /> : null}
      {items.map((e) => (
        <Card key={e.id} style={{ marginBottom: 8 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText variant="h3">{e.displayName || '—'} · {e.value}</AppText>
            <Pressable hitSlop={8} onPress={() => remove(e)} accessibilityLabel={t('common.delete')}><Ionicons name="trash-outline" size={20} color={colors.danger} /></Pressable>
          </Row>
          <AppText variant="tiny">{fmtShort(e.loggedOn)}{e.species ? ` · ${e.species}` : ''}{e.note ? ` · ${e.note}` : ''}</AppText>
        </Card>
      ))}
    </ModalScreen>
  );
}

export default function Gate() {
  const { user } = useAuth();
  return user?.role === 'admin' ? <Entries /> : null;
}
