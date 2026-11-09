import '../i18n';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts, Nunito_500Medium, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from '../state/AuthContext';
import { PetProvider } from '../state/PetContext';
import { colors, fonts } from '../theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: true } },
});

function Routes() {
  const { ready, signedIn, onboardingDone } = useAuth();
  const { t } = useTranslation();
  const modal = (title) => ({ presentation: 'modal', headerShown: true, title, headerStyle: { backgroundColor: colors.bg }, headerShadowVisible: false, headerTintColor: colors.ink, headerTitleStyle: { fontFamily: fonts.bold, color: colors.ink } });

  const detail = { headerShown: true, title: '', headerStyle: { backgroundColor: colors.bg }, headerShadowVisible: false, headerTintColor: colors.ink, headerBackTitle: t('common.back'), headerTitleStyle: { fontFamily: fonts.bold, color: colors.ink } };

  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => {}); }, [ready]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}><ActivityIndicator color={colors.green} /></View>;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && !onboardingDone}>
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && onboardingDone}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="quick" options={{ presentation: 'transparentModal', animation: 'fade' }} />
        <Stack.Screen name="pet-add" options={modal(t('pet.addTitle'))} />
        <Stack.Screen name="weight-add" options={modal(t('weight.logTitle'))} />
        <Stack.Screen name="medication-add" options={modal(t('med.addTitle'))} />
        <Stack.Screen name="vaccination-add" options={modal(t('vax.addTitle'))} />
        <Stack.Screen name="appointment-add" options={modal(t('appt.addTitle'))} />
        <Stack.Screen name="reminder-add" options={modal(t('reminders.addTitle'))} />
        <Stack.Screen name="feeding-add" options={modal(t('feed.addTitle'))} />
        <Stack.Screen name="notifications" options={modal(t('notifications.title'))} />
        <Stack.Screen name="challenges/[id]" options={detail} />
        <Stack.Screen name="chat" options={detail} />
        <Stack.Screen name="chat-room" options={detail} />
        <Stack.Screen name="admin-challenges" options={modal(t('admin.manageTitle'))} />
        <Stack.Screen name="admin-challenge-form" options={modal(t('admin.postChallenge'))} />
        <Stack.Screen name="admin-challenge-entries" options={modal(t('admin.entriesTitle'))} />
        <Stack.Screen name="unlock" options={modal(t('unlock.title'))} />
        <Stack.Screen name="group-add" options={modal(t('community.create'))} />
        <Stack.Screen name="event-add" options={modal(t('events.host'))} />
        <Stack.Screen name="report" options={modal(t('safety.report'))} />
        <Stack.Screen name="groups/[id]" options={detail} />
        <Stack.Screen name="posts/[id]" options={detail} />
        <Stack.Screen name="events/[id]" options={detail} />
        <Stack.Screen name="ideas/[id]" options={detail} />
        <Stack.Screen name="settings" options={modal(t('settings.title'))} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded, fontError] = useFonts({ Nunito_500Medium, Nunito_700Bold, Nunito_800ExtraBold });
  if (!loaded && !fontError) return null; // a font that fails to load must not leave a blank screen
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PetProvider>
            <StatusBar style="dark" />
            <Routes />
          </PetProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
