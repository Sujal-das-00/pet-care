import { Alert, Platform, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, Chip, EmptyState, Gap, Row, Screen, SectionHeader } from '../../components/ui';
import { PetAvatar, PetSelector, Stat } from '../../components/pets';
import ReminderRow from '../../components/ReminderRow';
import WeightChart from '../../components/WeightChart';
import { useAuth } from '../../state/AuthContext';
import { usePetSelection } from '../../state/PetContext';
import { PetsApi, RemindersApi } from '../../api/resources';
import { keys, useAction, useAppointments, useFeeding, useMedications, useReminders, useVaccinations, useWeightSeries } from '../../hooks/usePets';
import { colors, space } from '../../theme';
import { fmtAge, fmtDate, fmtDateLong, fmtDateTime, fmtShort, fmtWeight } from '../../utils/format';

const confirm = (title, body, onYes, t) => {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(`${title}\n${body}`)) onYes(); return; }
  Alert.alert(title, body, [{ text: t('common.cancel'), style: 'cancel' }, { text: t('common.delete'), style: 'destructive', onPress: onYes }]);
};

function AddButton({ label, onPress }) {
  return <Button small variant="soft" icon="add" title={label} onPress={onPress} style={{ alignSelf: 'flex-start', marginTop: space.md }} />;
}

export default function MyPet() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { pets, selected: pet, selectPet } = usePetSelection();
  const id = pet?.id;
  const unit = user?.preferences?.weightUnit || 'kg';

  const series = useWeightSeries(id);
  const meds = useMedications(id);
  const vax = useVaccinations(id);
  const appts = useAppointments(id);
  const feeding = useFeeding(id);
  const reminders = useReminders(id ? `scope=upcoming&days=30&petId=${id}` : 'scope=upcoming');

  const finishMed = useAction((medId) => PetsApi.finishMedication(id, medId), [keys.meds(id)]);
  const delVax = useAction((vid) => PetsApi.deleteVaccination(id, vid), [keys.vax(id)]);
  const delFeed = useAction((fid) => PetsApi.deleteFeeding(id, fid), [keys.feeding(id)]);
  const cancelAppt = useAction((aid) => PetsApi.updateAppointment(id, aid, { status: 'cancelled' }), [keys.appts(id)]);
  const doneAppt = useAction((aid) => PetsApi.updateAppointment(id, aid, { status: 'completed' }), [keys.appts(id)]);
  const complete = useAction(({ rid, action }) => RemindersApi.complete(rid, action));
  const delPet = useAction(() => PetsApi.remove(id), [keys.pets]);

  const header = (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <AppText variant="display">{t('tabs.pet')}</AppText>
        <Button small variant="soft" icon="add" title={t('pet.add')} onPress={() => router.push('/pet-add')} />
      </Row>
      <View style={{ marginTop: 10 }}><PetSelector pets={pets} selected={pet} onSelect={selectPet} /></View>
    </View>
  );

  if (!pet) {
    return (
      <Screen header={header}>
        <Gap />
        <EmptyState icon="paw-outline" title={t('home.noPetTitle')} body={t('home.noPetBody')} action={<Button small title={t('pet.addTitle')} onPress={() => router.push('/pet-add')} />} />
      </Screen>
    );
  }

  const nextVax = (vax.data?.items ?? []).filter((v) => v.nextDueOn).sort((a, b) => a.nextDueOn.localeCompare(b.nextDueOn))[0];
  const nextAppt = (appts.data?.items ?? []).slice().sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
  const points = series.data?.points ?? [];
  const sum = series.data?.summary;
  const careReminders = (reminders.data?.items ?? []).filter((r) => r.petId === id);

  return (
    <Screen header={header}>
      {/* Profile */}
      <Gap h={space.sm} />
      <Card>
        <Row gap={16}>
          <PetAvatar pet={pet} size={78} ring />
          <View style={{ flex: 1 }}>
            <AppText variant="h1">{pet.name}</AppText>
            <AppText>{[pet.breed, fmtAge(pet.age, t)].filter(Boolean).join(' · ')}</AppText>
            <Row gap={6} style={{ marginTop: 8, flexWrap: 'wrap' }}>
              <Chip label={t(`pet.species.${pet.species}`)} />
              {pet.gender !== 'unknown' ? <Chip label={t(`pet.genders.${pet.gender}`)} tint={colors.lavender} ink={colors.lavenderInk} /> : null}
              {pet.personality?.map((p) => <Chip key={p} label={p} tint={colors.yellow} ink={colors.yellowInk} />)}
            </Row>
          </View>
        </Row>
      </Card>

      {/* Health summary */}
      <SectionHeader title={t('pet.healthSummary')} icon="heart" />
      <Row gap={10} align="stretch">
        <Stat icon="scale" label={t('weight.title')} value={fmtWeight(pet.latestWeight?.weightGrams, unit)} />
        <Stat icon="shield-checkmark" label={t('vax.nextDue')} value={nextVax ? fmtShort(nextVax.nextDueOn) : '–'} tint={colors.blue} ink={colors.blueInk} />
        <Stat icon="calendar" label={t('appt.next')} value={nextAppt ? fmtShort(nextAppt.scheduledAt) : '–'} tint={colors.lavender} ink={colors.lavenderInk} />
      </Row>

      {/* Weight */}
      <SectionHeader title={t('weight.title')} icon="scale-outline" action={t('weight.log')} onAction={() => router.push('/weight-add')} />
      <Card>
        {points.length ? (
          <>
            <WeightChart points={points} unit={series.data.unit} />
            {sum?.changeSincePrevious != null ? (
              <AppText variant="small" style={{ marginTop: 6 }}>
                {t('weight.changeSincePrev', { v: `${sum.changeSincePrevious > 0 ? '+' : ''}${sum.changeSincePrevious} ${series.data.unit}` })}
              </AppText>
            ) : null}
          </>
        ) : (
          <EmptyState icon="scale-outline" title={t('weight.emptyTitle')} body={t('weight.emptyBody')} action={<Button small title={t('weight.log')} onPress={() => router.push('/weight-add')} />} />
        )}
      </Card>

      {/* Medication */}
      <SectionHeader title={t('med.title')} icon="medkit-outline" />
      <Card>
        {(meds.data?.items ?? []).length === 0 ? <AppText variant="small">{t('med.empty')}</AppText> : null}
        {(meds.data?.items ?? []).map((m, i) => (
          <View key={m.id} style={[{ paddingVertical: 10 }, i ? { borderTopWidth: 1, borderTopColor: colors.line } : null]}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <AppText variant="h3">{m.name}</AppText>
                {m.dosageInstructions ? <AppText variant="small">{m.dosageInstructions}</AppText> : null}
                <AppText variant="tiny" style={{ marginTop: 2 }}>
                  {m.schedules.map((s) => s.localTime).join(' · ') || t('med.noSchedule')} · {fmtDate(m.startDate)}{m.endDate ? ` → ${fmtDate(m.endDate)}` : ''}
                </AppText>
              </View>
              <Button small variant="ghost" title={t('med.finish')} onPress={() => confirm(t('med.finishTitle'), t('med.finishBody', { name: m.name }), () => finishMed.mutate(m.id), t)} />
            </Row>
          </View>
        ))}
        <AddButton label={t('med.add')} onPress={() => router.push('/medication-add')} />
        <AppText variant="tiny" style={{ marginTop: 10 }}>{t('med.disclaimer')}</AppText>
      </Card>

      {/* Vaccinations */}
      <SectionHeader title={t('vax.title')} icon="shield-checkmark-outline" />
      <Card>
        {(vax.data?.items ?? []).length === 0 ? <AppText variant="small">{t('vax.empty')}</AppText> : null}
        {(vax.data?.items ?? []).map((v, i) => (
          <Row key={v.id} style={[{ paddingVertical: 10, justifyContent: 'space-between' }, i ? { borderTopWidth: 1, borderTopColor: colors.line } : null]}>
            <View style={{ flex: 1 }}>
              <AppText variant="h3">{v.name}</AppText>
              <AppText variant="small">{fmtDateLong(v.administeredOn)}{v.clinicName ? ` · ${v.clinicName}` : ''}</AppText>
              {v.nextDueOn ? <AppText variant="tiny" style={{ color: colors.blueInk }}>{t('vax.nextDue')}: {fmtDateLong(v.nextDueOn)}</AppText> : null}
            </View>
            <Pressable onPress={() => confirm(t('common.delete'), v.name, () => delVax.mutate(v.id), t)} hitSlop={8}><Ionicons name="trash-outline" size={20} color={colors.inkMute} /></Pressable>
          </Row>
        ))}
        <AddButton label={t('vax.add')} onPress={() => router.push('/vaccination-add')} />
      </Card>

      {/* Vet appointments */}
      <SectionHeader title={t('appt.title')} icon="calendar-outline" />
      <Card>
        {(appts.data?.items ?? []).length === 0 ? <AppText variant="small">{t('appt.empty')}</AppText> : null}
        {(appts.data?.items ?? []).map((a, i) => (
          <View key={a.id} style={[{ paddingVertical: 10 }, i ? { borderTopWidth: 1, borderTopColor: colors.line } : null]}>
            <AppText variant="h3">{a.clinicName}</AppText>
            <AppText variant="small">{fmtDateTime(a.scheduledAt)}{a.reason ? ` · ${a.reason}` : ''}</AppText>
            <Row gap={8} style={{ marginTop: 8 }}>
              <Button small variant="soft" title={t('appt.markDone')} onPress={() => doneAppt.mutate(a.id)} />
              <Button small variant="ghost" title={t('common.cancel')} onPress={() => cancelAppt.mutate(a.id)} />
            </Row>
          </View>
        ))}
        <AddButton label={t('appt.add')} onPress={() => router.push('/appointment-add')} />
      </Card>

      {/* Care schedules */}
      <SectionHeader title={t('care.title')} icon="time-outline" />
      <Card>
        <AppText variant="h3" style={{ marginBottom: 4 }}>{t('feed.title')}</AppText>
        {(feeding.data?.items ?? []).length === 0 ? <AppText variant="small">{t('feed.empty')}</AppText> : null}
        {(feeding.data?.items ?? []).map((f) => (
          <Row key={f.id} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
            <Row gap={10}><Ionicons name="restaurant" size={18} color={colors.yellowInk} /><AppText>{f.localTime} · {f.label}</AppText></Row>
            <Pressable onPress={() => confirm(t('common.delete'), f.label, () => delFeed.mutate(f.id), t)} hitSlop={8}><Ionicons name="trash-outline" size={18} color={colors.inkMute} /></Pressable>
          </Row>
        ))}
        <AddButton label={t('feed.add')} onPress={() => router.push('/feeding-add')} />

        <View style={{ height: 1, backgroundColor: colors.line, marginVertical: space.lg }} />
        <AppText variant="h3" style={{ marginBottom: 4 }}>{t('reminders.title')}</AppText>
        {careReminders.length === 0 ? <AppText variant="small">{t('reminders.empty')}</AppText> : null}
        {careReminders.slice(0, 8).map((r) => (
          <ReminderRow key={r.id} reminder={r} busy={complete.isPending}
            onDone={() => complete.mutate({ rid: r.id, action: 'done' })}
            onSkip={() => complete.mutate({ rid: r.id, action: 'skip' })} />
        ))}
        <AddButton label={t('reminders.add')} onPress={() => router.push('/reminder-add')} />
      </Card>

      <Gap h={space.xxl} />
      <Button variant="danger" title={t('pet.delete')} onPress={() => confirm(t('pet.delete'), t('pet.deleteBody', { name: pet.name }), () => delPet.mutate(), t)} />
    </Screen>
  );
}
