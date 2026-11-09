import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Gap, Row } from '../../components/ui';
import { Hero } from '../../components/pets';
import { colors, fonts, gutter } from '../../theme';

export default function Welcome() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Hero height={380}>
        <View style={{ paddingTop: insets.top + 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={8}>
              <Ionicons name="paw" size={26} color={colors.orange} />
              <Text style={{ fontFamily: fonts.bold, fontSize: 24, color: colors.ink }}>PawCircle</Text>
            </Row>
          </Row>
        </View>
      </Hero>

      <View style={{ paddingHorizontal: gutter, flex: 1, justifyContent: 'center' }}>
        <AppText variant="display" style={{ textAlign: 'center' }}>{t('welcome.title')}</AppText>
        <Gap h={10} />
        <AppText style={{ textAlign: 'center' }}>{t('welcome.subtitle')}</AppText>
        <Gap h={28} />
        <Button title={t('welcome.create')} onPress={() => router.push('/register')} />
        <Gap h={12} />
        <Button title={t('welcome.signIn')} variant="ghost" onPress={() => router.push('/login')} />
        <Gap h={insets.bottom + 8} />
      </View>
    </View>
  );
}
