import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { MeApi } from '../api/resources';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function pushStatus() {
  try {
    return (await Notifications.getPermissionsAsync()).status; // 'granted' | 'denied' | 'undetermined'
  } catch {
    return 'unsupported';
  }
}

/**
 * Asks for notification permission *in context* (never at sign-up), then registers the Expo push
 * token with the backend. Returns 'granted' | 'denied' | 'unsupported' | 'no_project'.
 */
export async function enablePush() {
  if (Platform.OS === 'web') return 'unsupported';
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('care', { name: 'Pet care', importance: Notifications.AndroidImportance.HIGH });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return 'denied';
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return 'no_project'; // needs an EAS project id (see README)
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await MeApi.registerDevice({ pushToken: token, platform: Platform.OS, tokenType: 'expo', locale: 'en' });
    return 'granted';
  } catch {
    return 'unsupported';
  }
}
