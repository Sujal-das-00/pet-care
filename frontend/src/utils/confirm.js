import { Alert, Platform } from 'react-native';
import i18n from '../i18n';

/** Cross-platform confirm: Alert on native, window.confirm on web (Alert buttons don't work there). */
export function confirmAction(title, body, confirmLabel, onConfirm) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.([title, body].filter(Boolean).join('\n'))) onConfirm();
    return;
  }
  Alert.alert(title, body || undefined, [
    { text: i18n.t('common.cancel'), style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
