import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText, Button, ErrorNote, Field, Gap, Screen } from '../../components/ui';
import { useAuth } from '../../state/AuthContext';
import { errMsg } from '../../utils/format';

export default function Login() {
  const { t } = useTranslation();
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await login({ email: email.trim(), password });
    } catch (e) {
      setError(e.status === 401 ? t('auth.badCredentials') : errMsg(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <AppText variant="display">{t('auth.signInTitle')}</AppText>
        <Gap h={24} />
        <ErrorNote message={error} />
        <Field label={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={submit} />
        <Button title={t('welcome.signIn')} onPress={submit} loading={busy} disabled={!email || !password} />
        <Gap h={12} />
        <Button title={t('welcome.create')} variant="ghost" onPress={() => router.replace('/register')} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
