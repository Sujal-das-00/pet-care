import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, ErrorNote, Field, Gap, Row, Screen } from '../../components/ui';
import { useAuth } from '../../state/AuthContext';
import { colors } from '../../theme';
import { errMsg } from '../../utils/format';

function Check({ checked, onToggle, label }) {
  return (
    <Pressable onPress={onToggle} style={{ marginBottom: 12 }} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      <Row align="flex-start" gap={10}>
        <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={checked ? colors.green : colors.inkMute} />
        <AppText variant="small" style={{ flex: 1 }}>{label}</AppText>
      </Row>
    </Pressable>
  );
}

export default function Register() {
  const { t } = useTranslation();
  const router = useRouter();
  const { register } = useAuth();
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const weak = form.password.length > 0 && form.password.length < 8;
  const ok = form.displayName.trim() && form.email.includes('@') && form.password.length >= 8 && terms;

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await register({
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        password: form.password,
        locale: 'en',
        acceptTerms: true,
        acceptPrivacy: true,
        marketingOptIn: marketing,
      });
    } catch (e) {
      setError(e.status === 409 ? t('auth.emailTaken') : errMsg(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <AppText variant="display">{t('auth.registerTitle')}</AppText>
        <Gap h={24} />
        <ErrorNote message={error} />
        <Field label={t('auth.displayName')} value={form.displayName} onChangeText={set('displayName')} maxLength={40} />
        <Field label={t('auth.email')} value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label={t('auth.password')} value={form.password} onChangeText={set('password')} secureTextEntry error={weak ? t('auth.passwordShort') : undefined} hint={t('auth.passwordHint')} />
        <Check checked={terms} onToggle={() => setTerms(!terms)} label={t('auth.acceptTerms')} />
        <Check checked={marketing} onToggle={() => setMarketing(!marketing)} label={t('auth.marketing')} />
        <Gap h={8} />
        <Button title={t('welcome.create')} onPress={submit} loading={busy} disabled={!ok} />
        <Gap h={12} />
        <Button title={t('welcome.signIn')} variant="ghost" onPress={() => router.replace('/login')} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
