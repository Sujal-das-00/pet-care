import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, Chip, ErrorNote, Gap, ModalScreen, Row } from '../components/ui';
import { MembershipApi } from '../api/resources';
import { useMembership } from '../hooks/useMembership';
import { hostNetwork, isInsideNimiqPay, payWithNimiqPay } from '../payments/nimiqPay';
import { colors, fonts } from '../theme';

const POLL_MS = 4000;
const MAX_POLLS = 45; // ~3 minutes, long enough for a few confirmations

function CopyRow({ label, value }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <View style={{ marginBottom: 12 }}>
      <AppText variant="tiny">{label}</AppText>
      <Row gap={10} style={{ justifyContent: 'space-between' }}>
        <Text selectable style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>{value}</Text>
        <Button small variant="soft" title={copied ? t('unlock.copied') : t('unlock.copy')} onPress={async () => { await Clipboard.setStringAsync(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }} />
      </Row>
    </View>
  );
}

export default function Unlock() {
  const { t } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const membership = useMembership();
  const info = membership.data;

  const [intent, setIntent] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | paying | checking | paid
  const [progress, setProgress] = useState(null); // { confirmations, needed } | { searching: true }
  const [error, setError] = useState('');
  const alive = useRef(true);
  const run = useRef(0); // increments to cancel an older polling loop
  useEffect(() => () => { alive.current = false; }, []);

  const member = Boolean(info?.membership);
  const inside = isInsideNimiqPay();

  // Prepare a payment request as soon as we know payments are possible.
  useEffect(() => {
    if (!info?.nimiq?.enabled || member || intent) return;
    MembershipApi.createIntent()
      .then((r) => { if (alive.current) setIntent(r.intent); })
      .catch((e) => { if (e.code === 'already_member') membership.refetch(); else if (alive.current) setError(t('unlock.cannotStart')); });
  }, [info?.nimiq?.enabled, member, intent, membership, t]);

  const succeed = useCallback(async () => {
    setPhase('paid');
    await qc.invalidateQueries(); // everything community-shaped can now load
  }, [qc]);

  /** Ask the server to confirm on-chain, then keep asking until confirmed (or give up politely). */
  const confirm = useCallback(async (txHash) => {
    if (!intent) return;
    const mine = ++run.current;
    setError('');
    setPhase('checking');
    setProgress({ searching: true });
    for (let i = 0; i < MAX_POLLS; i += 1) {
      if (!alive.current || mine !== run.current) return;
      try {
        const r = await MembershipApi.verify(intent.id, txHash);
        if (r.status === 'paid') { await succeed(); return; }
        setProgress(r.reason === 'awaiting_confirmations' ? { confirmations: r.confirmations, needed: r.needed } : { searching: true });
      } catch (e) {
        if (e.code === 'payment_invalid') setError(t(`unlock.reasons.${e.details?.reason}`, { defaultValue: t('unlock.invalid') }));
        else if (e.code === 'payment_already_used') setError(t('unlock.alreadyUsed'));
        else setError(t('unlock.checkFailed'));
        setPhase('idle');
        return;
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    if (alive.current && mine === run.current) { setPhase('idle'); setError(t('unlock.stillWaiting')); }
  }, [intent, succeed, t]);

  const pay = async () => {
    if (!intent) return;
    setError('');
    const host = hostNetwork();
    if (host && host !== intent.network) { setError(t('unlock.wrongNetwork', { host, expected: intent.network })); return; }
    setPhase('paying');
    try {
      const r = await payWithNimiqPay({ recipient: intent.recipient, amountLuna: intent.amountLuna, reference: intent.reference });
      if (r.cancelled) { setPhase('idle'); return; }
      await confirm(r.txHash);
    } catch (e) {
      setPhase('idle');
      setError(e?.type === 'INVALID_TRANSACTION' ? t('unlock.invalid') : t('unlock.payFailed'));
    }
  };

  /* ---------- views ---------- */
  if (phase === 'paid' || member) {
    return (
      <ModalScreen footer={<Button title={t('unlock.enter')} onPress={() => router.replace('/community')} />}>
        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
          <Text style={{ fontSize: 64 }}>🎉</Text>
          <AppText variant="h1" style={{ marginTop: 12, textAlign: 'center' }}>{t('unlock.successTitle')}</AppText>
          <AppText style={{ textAlign: 'center', marginTop: 8 }}>{t('unlock.successBody')}</AppText>
        </View>
      </ModalScreen>
    );
  }

  const nim = info?.price?.nim ?? 1;
  const testnet = info?.nimiq?.network === 'testnet';

  return (
    <ModalScreen>
      <Card tint={colors.lavender}>
        <Row gap={12}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="diamond" size={26} color={colors.lavenderInk} /></View>
          <View style={{ flex: 1 }}>
            <AppText variant="h1">{t('paywall.price', { nim })}</AppText>
            <AppText variant="small">{info?.price?.oneTime === false ? t('paywall.recurring', { days: info.price.days }) : t('paywall.oneTime')} · {t('unlock.forAccess')}</AppText>
          </View>
          {testnet ? <Chip label={t('unlock.testnet')} tint={colors.yellow} ink={colors.yellowInk} /> : null}
        </Row>
      </Card>
      <Gap h={16} />
      <ErrorNote message={error} />

      {membership.isLoading ? null : !info?.nimiq?.enabled ? (
        <Card tint={colors.yellow}>
          <AppText variant="h3">{t('unlock.unavailableTitle')}</AppText>
          <AppText variant="small" style={{ color: colors.ink, marginTop: 4 }}>{t('unlock.unavailableBody')}</AppText>
        </Card>
      ) : !intent ? null : (
        <>
          {inside ? (
            <>
              <AppText style={{ marginBottom: 12 }}>{t('unlock.insideBody')}</AppText>
              <Button icon="wallet" title={t('unlock.payNow', { nim })} onPress={pay} loading={phase === 'paying'} disabled={phase === 'checking'} />
            </>
          ) : (
            <>
              <Card style={{ marginBottom: 12 }}>
                <AppText variant="h3" style={{ marginBottom: 8 }}>{t('unlock.manualTitle')}</AppText>
                <AppText variant="small" style={{ marginBottom: 12 }}>{t('unlock.manualBody')}</AppText>
                <CopyRow label={t('unlock.address')} value={intent.recipient} />
                <CopyRow label={t('unlock.amount')} value={`${intent.amountNim} NIM`} />
                <CopyRow label={t('unlock.message')} value={intent.reference} />
                <AppText variant="tiny">{t('unlock.messageWarn')}</AppText>
              </Card>
              <Button icon="open-outline" variant="soft" title={t('unlock.openWallet')} onPress={() => Linking.openURL(intent.uri).catch(() => setError(t('unlock.noWallet')))} />
              <Gap h={10} />
              <Button icon="checkmark-circle" title={t('unlock.iPaid')} onPress={() => confirm()} loading={phase === 'checking'} />
              <AppText variant="tiny" style={{ marginTop: 12, textAlign: 'center' }}>{t('unlock.tipInside')}</AppText>
            </>
          )}

          {phase === 'checking' ? (
            <Card tint={colors.greenSoft} style={{ marginTop: 16 }}>
              <Row gap={10}>
                <Ionicons name="hourglass" size={22} color={colors.greenDark} />
                <AppText style={{ flex: 1, color: colors.ink }}>
                  {progress?.needed ? t('unlock.confirming', { n: progress.confirmations, total: progress.needed }) : t('unlock.searching')}
                </AppText>
              </Row>
            </Card>
          ) : null}
        </>
      )}

      <AppText variant="tiny" style={{ marginTop: 24 }}>{t('unlock.footer')}</AppText>
    </ModalScreen>
  );
}
