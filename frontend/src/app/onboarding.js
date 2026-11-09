import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, Chip, ChoiceRow, DateField, EmptyState, ErrorNote, Field, Gap, Row, Screen, TimeField } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { PetsApi } from '../api/resources';
import { colors, fonts, radius, space } from '../theme';
import { errMsg, isDate, isTime } from '../utils/format';
import { PrefecturePicker, CommunityRow } from '../components/community';
import { CommunityApi } from '../api/resources';
import { useCommunities, useRefreshCommunity } from '../hooks/useCommunity';
import { useCommunityAccess } from '../hooks/useMembership';

const STEPS = 5;
const INTERESTS = ['walks', 'fitness', 'photography', 'training', 'meetups', 'hiking', 'cats', 'adoption'];

export default function Onboarding() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user, updateMe } = useAuth();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [owner, setOwner] = useState({ displayName: user?.profile?.displayName || '', prefecture: '', city: '' });
  const refreshCommunity = useRefreshCommunity();
  const access = useCommunityAccess();
  const nearby = useCommunities({ scope: owner.prefecture ? 'nearby' : 'popular', prefecture: owner.prefecture || undefined, limit: 4 }, !access.loading && !access.locked);
  const [joined, setJoined] = useState([]);
  const [pet, setPet] = useState({ species: 'dog', name: '', breed: '', gender: 'unknown', dateOfBirth: '' });
  const [petId, setPetId] = useState(null);
  const [meal, setMeal] = useState({ on: false, time: '08:00' });
  const [prefs, setPrefs] = useState({ dailyStepGoal: 8000, weightUnit: 'kg' });
  const [interests, setInterests] = useState([]);

  const fail = (e) => { setError(errMsg(e, t)); setBusy(false); return false; };

  const savePet = async () => {
    if (pet.dateOfBirth && !isDate(pet.dateOfBirth)) { setError(t('forms.badDate')); return false; }
    const body = {
      name: pet.name.trim(), breed: pet.breed.trim(), gender: pet.gender, species: pet.species,
      dateOfBirth: pet.dateOfBirth || null,
    };
    try {
      // Going back and forward must not create duplicate pets.
      if (petId) { const { species, ...patch } = body; await PetsApi.update(petId, patch); } // eslint-disable-line no-unused-vars
      else setPetId((await PetsApi.create(body)).pet.id);
      return true;
    } catch (e) { return fail(e); }
  };

  const saveCare = async () => {
    if (!meal.on) return true;
    if (!isTime(meal.time)) { setError(t('forms.badTime')); return false; }
    try {
      await PetsApi.addFeeding(petId, { label: t('feed.defaultLabel'), localTime: meal.time });
      return true;
    } catch (e) { return fail(e); }
  };

  const finish = async () => {
    try {
      await updateMe({
        profile: { displayName: owner.displayName.trim(), prefecture: owner.prefecture.trim(), city: owner.city.trim() },
        preferences: { ...prefs, interests, onboardingCompleted: true },
      });
      qc.invalidateQueries();
      return true;
    } catch (e) { return fail(e); }
  };

  const canNext = [
    owner.displayName.trim().length > 0,
    pet.name.trim().length > 0,
    true,
    true,
    true,
  ][step];

  const next = async () => {
    setError('');
    setBusy(true);
    let ok = true;
    if (step === 1) ok = await savePet();
    if (step === 2) ok = await saveCare();
    if (step === STEPS - 1) ok = await finish();
    setBusy(false);
    if (ok && step < STEPS - 1) setStep(step + 1);
  };

  const toggleInterest = (k) => setInterests((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Row gap={6} style={{ marginBottom: space.xl }}>
          {Array.from({ length: STEPS }).map((_, i) => (
            <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= step ? colors.green : colors.greenTrack }} />
          ))}
        </Row>
        <AppText variant="tiny" style={{ marginBottom: 4 }}>{t('onboarding.step', { n: step + 1, total: STEPS })}</AppText>
        <AppText variant="display">{t(`onboarding.s${step}.title`)}</AppText>
        <AppText style={{ marginTop: 6, marginBottom: space.xl }}>{t(`onboarding.s${step}.body`)}</AppText>
        <ErrorNote message={error} />

        {step === 0 && (
          <>
            <Field label={t('auth.displayName')} value={owner.displayName} onChangeText={(v) => setOwner({ ...owner, displayName: v })} maxLength={40} />
            <PrefecturePicker label={t('onboarding.prefecture')} value={owner.prefecture} onChange={(v) => setOwner({ ...owner, prefecture: v })} allowClear />
            <Field label={t('onboarding.city')} value={owner.city} onChangeText={(v) => setOwner({ ...owner, city: v })} placeholder={t('onboarding.cityPh')} hint={t('onboarding.privacyNote')} />
          </>
        )}

        {step === 1 && (
          <>
            <Row gap={12} style={{ marginBottom: space.xl }}>
              {[['dog', '🐶', colors.peach], ['cat', '🐱', colors.lavender]].map(([s, emoji, tint]) => (
                <Pressable key={s} disabled={Boolean(petId)} onPress={() => setPet({ ...pet, species: s })} style={{ flex: 1, alignItems: 'center', padding: 18, borderRadius: radius.xl, backgroundColor: tint, borderWidth: 3, borderColor: pet.species === s ? colors.green : 'transparent', opacity: petId && pet.species !== s ? 0.4 : 1 }}>
                  <Text style={{ fontSize: 52 }}>{emoji}</Text>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.ink, marginTop: 4 }}>{t(`pet.species.${s}`)}</Text>
                </Pressable>
              ))}
            </Row>
            <Field label={t('pet.name')} value={pet.name} onChangeText={(v) => setPet({ ...pet, name: v })} maxLength={40} />
            <Field label={t('pet.breed')} value={pet.breed} onChangeText={(v) => setPet({ ...pet, breed: v })} />
            <AppText variant="small" style={{ fontFamily: fonts.semibold, color: colors.ink, marginBottom: 6, marginLeft: 4 }}>{t('pet.gender')}</AppText>
            <ChoiceRow value={pet.gender} onChange={(v) => setPet({ ...pet, gender: v })} options={['male', 'female', 'unknown'].map((g) => ({ value: g, label: t(`pet.genders.${g}`) }))} />
            <DateField label={t('pet.dob')} value={pet.dateOfBirth} onChangeText={(v) => setPet({ ...pet, dateOfBirth: v })} hint={t('pet.dobHint')} />
          </>
        )}

        {step === 2 && (
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={10}>
                <Ionicons name="restaurant" size={22} color={colors.yellowInk} />
                <View>
                  <AppText variant="h3">{t('feed.title')}</AppText>
                  <AppText variant="small">{t('onboarding.mealHint')}</AppText>
                </View>
              </Row>
              <Chip label={meal.on ? t('common.on') : t('common.off')} selected={meal.on} onPress={() => setMeal({ ...meal, on: !meal.on })} />
            </Row>
            {meal.on ? <View style={{ marginTop: space.lg }}><TimeField label={t('feed.time')} value={meal.time} onChangeText={(v) => setMeal({ ...meal, time: v })} /></View> : null}
            <AppText variant="tiny" style={{ marginTop: 4 }}>{t('onboarding.notifLater')}</AppText>
          </Card>
        )}

        {step === 3 && (
          <>
            <AppText variant="h3" style={{ marginBottom: 8 }}>{t('onboarding.stepGoal')}</AppText>
            <ChoiceRow value={prefs.dailyStepGoal} onChange={(v) => setPrefs({ ...prefs, dailyStepGoal: v })} options={[5000, 8000, 10000, 12000].map((n) => ({ value: n, label: n.toLocaleString() }))} />
            <AppText variant="h3" style={{ marginBottom: 8 }}>{t('onboarding.weightUnit')}</AppText>
            <ChoiceRow value={prefs.weightUnit} onChange={(v) => setPrefs({ ...prefs, weightUnit: v })} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />
            <AppText variant="small">{t('onboarding.gpsLater')}</AppText>
          </>
        )}

        {step === 4 && (
          <>
            <Row style={{ flexWrap: 'wrap', marginBottom: space.xl }} gap={8}>
              {INTERESTS.map((k) => <Chip key={k} label={t(`interests.${k}`)} selected={interests.includes(k)} onPress={() => toggleInterest(k)} />)}
            </Row>
            {access.locked ? (
              <Card tint={colors.lavender}>
                <Row gap={12} align="flex-start">
                  <Ionicons name="lock-closed" size={26} color={colors.lavenderInk} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="h3">{t('onboarding.communityPaid', { nim: access.info?.price?.nim ?? 1 })}</AppText>
                    <AppText variant="small" style={{ color: colors.ink, marginTop: 2 }}>{t('onboarding.communityPaidBody')}</AppText>
                  </View>
                </Row>
              </Card>
            ) : (
              <>
            <AppText variant="h3" style={{ marginBottom: 8 }}>{owner.prefecture ? t('onboarding.nearYou') : t('onboarding.popularNow')}</AppText>
            {(nearby.data?.items ?? []).map((c) => (
              <CommunityRow key={c.id} community={c} right={
                <Button small variant={joined.includes(c.id) ? 'ghost' : 'soft'} title={joined.includes(c.id) ? t('community.joined') : t('community.join')}
                  onPress={async () => { try { await CommunityApi.join(c.id); setJoined((j) => [...j, c.id]); refreshCommunity(); } catch (e) { setError(errMsg(e, t)); } }} />
              } />
            ))}
            {nearby.data && !nearby.data.items.length ? <EmptyState icon="people-outline" title={t('onboarding.noCommunities')} body={t('onboarding.noCommunitiesBody')} /> : null}
              </>
            )}
          </>
        )}

        <Gap h={28} />
        <Button title={step === STEPS - 1 ? t('onboarding.finish') : t('common.next')} onPress={next} loading={busy} disabled={!canNext} />
        {step > 0 ? (
          <>
            <Gap h={10} />
            <Button title={t('common.back')} variant="ghost" onPress={() => { setError(''); setStep(step - 1); }} />
          </>
        ) : null}
        {step === 2 || step === 3 ? (
          <Pressable onPress={() => { setError(''); setStep(step + 1); }} style={{ alignItems: 'center', padding: 14 }}>
            <AppText variant="small" style={{ fontFamily: fonts.semibold }}>{t('common.skip')}</AppText>
          </Pressable>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
