import { useEffect } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Card, EmptyState, ModalScreen, Row } from '../components/ui';
import { MeApi } from '../api/resources';
import { keys, useNotifications } from '../hooks/usePets';
import { colors } from '../theme';
import { fmtDateTime } from '../utils/format';

export default function Notifications() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useNotifications();

  // Opening the inbox marks everything read.
  useEffect(() => {
    if (data?.unread > 0) MeApi.readAll().then(() => qc.invalidateQueries({ queryKey: keys.home }));
  }, [data?.unread, qc]);

  const items = data?.items ?? [];
  return (
    <ModalScreen>
      {!items.length && !isLoading ? <EmptyState icon="notifications-outline" title={t('notifications.emptyTitle')} body={t('notifications.emptyBody')} /> : null}
      {items.map((n) => (
        <Card key={n.id} style={{ marginBottom: 10 }}>
          <Row gap={12} align="flex-start">
            <Ionicons name="notifications" size={22} color={n.readAt ? colors.inkMute : colors.orange} />
            <View style={{ flex: 1 }}>
              <AppText variant="h3">{n.title}</AppText>
              {n.body ? <AppText variant="small">{n.body}</AppText> : null}
              <AppText variant="tiny" style={{ marginTop: 4 }}>{fmtDateTime(n.createdAt)}</AppText>
            </View>
          </Row>
        </Card>
      ))}
    </ModalScreen>
  );
}
