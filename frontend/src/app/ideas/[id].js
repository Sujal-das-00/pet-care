import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, Chip, EmptyState, Gap, Row, Screen, SectionHeader } from '../../components/ui';
import { CATEGORY_EMOJI } from '../../components/community';
import { useIdea } from '../../hooks/useCommunity';
import { colors } from '../../theme';
import { RequireCommunity } from '../../components/Paywall';

const Block = ({ icon, title, children }) => (
  <Card style={{ marginBottom: 12 }}>
    <Row gap={8} style={{ marginBottom: 6 }}><Ionicons name={icon} size={18} color={colors.green} /><AppText variant="h3">{title}</AppText></Row>
    {children}
  </Card>
);

function IdeaDetailScreen() {
  const { id } = useLocalSearchParams();
  const { t } = useTranslation();
  const router = useRouter();
  const { data, isError } = useIdea(id);
  const i = data?.idea;
  if (isError) return <Screen><EmptyState icon="alert-circle-outline" title={t('events.ideaGone')} /></Screen>;
  if (!i) return <Screen><View /></Screen>;
  return (
    <Screen padBottom={60}>
      <Stack.Screen options={{ title: t('events.ideaTitle') }} />
      <Card tint={colors.yellow} style={{ alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 52 }}>{i.emoji || CATEGORY_EMOJI[i.category]}</Text>
        <AppText variant="h1" style={{ textAlign: 'center', marginTop: 6 }}>{i.title}</AppText>
        <AppText style={{ textAlign: 'center', marginTop: 6, color: colors.ink }}>{i.concept}</AppText>
        <Row gap={8} style={{ flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 }}>
          <Chip label={t('events.groupSize', { min: i.recommendedGroupSize?.min, max: i.recommendedGroupSize?.max })} tint={colors.surface} ink={colors.inkSoft} icon="people" />
          <Chip label={t('events.minutes', { count: i.suggestedDurationMinutes })} tint={colors.surface} ink={colors.inkSoft} icon="time" />
        </Row>
      </Card>
      <Button icon="calendar" title={t('events.hostThis')} onPress={() => router.push(`/event-add?ideaId=${i.id}`)} />
      <Gap h={16} />
      <Block icon="list" title={t('events.format')}><AppText>{i.format}</AppText></Block>
      <Block icon="reader" title={t('events.howTo')}><AppText>{i.instructions}</AppText></Block>
      <Block icon="location" title={t('events.venue')}><AppText>{i.locationRequirements}</AppText></Block>
      <Block icon="camera" title={t('events.photos')}><AppText>{i.photoSuggestions}</AppText></Block>
      <SectionHeader title={t('events.safetyTitle')} icon="shield-checkmark" />
      <Card tint={colors.greenSoft}>
        {i.safety.map((s) => <Row key={s} gap={8} align="flex-start" style={{ marginBottom: 6 }}><Ionicons name="checkmark-circle" size={18} color={colors.green} /><AppText variant="small" style={{ flex: 1, color: colors.ink }}>{s}</AppText></Row>)}
      </Card>
    </Screen>
  );
}

// Members only: non-members are sent to the unlock screen.
export default function IdeaDetail() {
  return (
    <RequireCommunity>
      <IdeaDetailScreen />
    </RequireCommunity>
  );
}
