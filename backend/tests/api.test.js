import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { api, setup, teardown, signup, createPet, pushed } from './helpers.js';

// The app schedules in Asia/Tokyo; tests must use the same calendar day (UTC differs for 9 hours a day).
const tokyoToday = () => DateTime.now().setZone('Asia/Tokyo').toISODate();

const { Reminder } = await import('../src/models/Reminder.js');
const { Medication, MedicationDose } = await import('../src/models/Medication.js');
const { processDueReminders } = await import('../src/services/reminderService.js');

before(setup);
after(teardown);

describe('auth', () => {
  test('register requires consent and a valid body', async () => {
    const res = await api().post('/v1/auth/register').send({ email: 'x@example.com', password: 'longenough1', displayName: 'X' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'validation_error');
  });

  test('register, login, duplicate email, wrong password', async () => {
    const u = await signup();
    assert.ok(u.accessToken && u.refreshToken);
    assert.equal(u.user.locale, 'en');
    assert.equal(u.user.passwordHash, undefined);
    assert.deepEqual(u.user.consents.map((c) => c.kind).sort(), ['marketing', 'privacy', 'terms']);

    const dup = await api().post('/v1/auth/register').send({
      email: u.email.toUpperCase(), password: 'correct-horse-battery', displayName: 'Dup', acceptTerms: true, acceptPrivacy: true,
    });
    assert.equal(dup.status, 409);

    const bad = await api().post('/v1/auth/login').send({ email: u.email, password: 'nope-nope-nope' });
    assert.equal(bad.status, 401);
    const good = await api().post('/v1/auth/login').send({ email: u.email, password: u.password });
    assert.equal(good.status, 200);
  });

  test('refresh rotates and reuse of an old token revokes the family', async () => {
    const u = await signup();
    const r1 = await api().post('/v1/auth/refresh').send({ refreshToken: u.refreshToken });
    assert.equal(r1.status, 200);
    assert.notEqual(r1.body.refreshToken, u.refreshToken);

    const replay = await api().post('/v1/auth/refresh').send({ refreshToken: u.refreshToken });
    assert.equal(replay.status, 401);
    // the legitimately rotated token is now dead too
    const r2 = await api().post('/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken });
    assert.equal(r2.status, 401);
  });

  test('protected routes need a token', async () => {
    assert.equal((await api().get('/v1/pets')).status, 401);
    assert.equal((await api().get('/v1/pets').set('Authorization', 'Bearer junk')).status, 401);
  });
});

describe('pets and ownership', () => {
  test('CRUD, derived age, and cross-user isolation', async () => {
    const a = await signup();
    const b = await signup();
    const pet = await createPet(a);
    assert.equal(pet.name, 'Coco');
    assert.ok(pet.age.years >= 4);
    assert.equal(pet.ownerId, undefined);

    assert.equal((await api().get(`/v1/pets/${pet.id}`).set(b.auth)).status, 404);
    assert.equal((await api().patch(`/v1/pets/${pet.id}`).set(b.auth).send({ name: 'Hacked' })).status, 404);
    assert.equal((await api().delete(`/v1/pets/${pet.id}`).set(b.auth)).status, 404);
    assert.equal((await api().get('/v1/pets').set(b.auth)).body.items.length, 0);

    const up = await api().patch(`/v1/pets/${pet.id}`).set(a.auth).send({ personality: ['playful', 'shy'] });
    assert.deepEqual(up.body.pet.personality, ['playful', 'shy']);

    // partial updates must not reset untouched fields back to schema defaults
    const rename = await api().patch(`/v1/pets/${pet.id}`).set(a.auth).send({ name: 'Cocoa' });
    assert.equal(rename.body.pet.name, 'Cocoa');
    assert.equal(rename.body.pet.breed, 'Golden Retriever');
    assert.deepEqual(rename.body.pet.personality, ['playful', 'shy']);

    const bad = await api().patch(`/v1/pets/${pet.id}`).set(a.auth).send({ species: 'cat' });
    assert.equal(bad.status, 400, 'species is immutable');

    assert.equal((await api().delete(`/v1/pets/${pet.id}`).set(a.auth)).status, 204);
    assert.equal((await api().get(`/v1/pets/${pet.id}`).set(a.auth)).status, 404);
  });

  test('rejects invalid ids and species', async () => {
    const u = await signup();
    assert.equal((await api().get('/v1/pets/not-an-id').set(u.auth)).status, 400);
    assert.equal((await api().post('/v1/pets').set(u.auth).send({ name: 'Rex', species: 'dragon' })).status, 400);
  });
});

describe('weight tracking', () => {
  test('stores canonical grams, converts units, builds a series', async () => {
    const u = await signup();
    const pet = await createPet(u);
    const t = (d) => new Date(Date.now() - d * 86_400_000).toISOString();

    await api().post(`/v1/pets/${pet.id}/weights`).set(u.auth).send({ value: 24, measuredAt: t(30) });
    const lb = await api().post(`/v1/pets/${pet.id}/weights`).set(u.auth).send({ value: 55, unit: 'lb', measuredAt: t(1) });
    assert.equal(lb.status, 201);
    assert.equal(lb.body.weight.weightGrams, 24948);

    const series = await api().get(`/v1/pets/${pet.id}/weights/series?days=90`).set(u.auth);
    assert.equal(series.body.points.length, 2);
    assert.equal(series.body.points[0].value, 24);
    assert.equal(series.body.summary.changeSinceFirst, 0.95);

    const list = await api().get(`/v1/pets/${pet.id}/weights?limit=1`).set(u.auth);
    assert.equal(list.body.items.length, 1);
    assert.ok(list.body.nextCursor);
    const page2 = await api().get(`/v1/pets/${pet.id}/weights?limit=1&cursor=${list.body.nextCursor}`).set(u.auth);
    assert.equal(page2.body.items.length, 1);
    assert.equal(page2.body.nextCursor, null);

    const pets = await api().get('/v1/pets').set(u.auth);
    assert.equal(pets.body.items[0].latestWeight.weightGrams, 24948);
  });

  test('rejects absurd and future weights', async () => {
    const u = await signup();
    const pet = await createPet(u);
    assert.equal((await api().post(`/v1/pets/${pet.id}/weights`).set(u.auth).send({ value: -3 })).status, 400);
    assert.equal((await api().post(`/v1/pets/${pet.id}/weights`).set(u.auth).send({ value: 5000, unit: 'kg' })).status, 400);
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
    assert.equal((await api().post(`/v1/pets/${pet.id}/weights`).set(u.auth).send({ value: 10, measuredAt: future })).status, 400);
  });
});

describe('medication reminders end-to-end (journey 2)', () => {
  test('create -> scheduler delivers push -> user completes -> dose history', async () => {
    const u = await signup();
    const pet = await createPet(u);
    const today = tokyoToday();

    const res = await api().post(`/v1/pets/${pet.id}/medications`).set(u.auth).send({
      name: 'Prednisolone', dosageInstructions: 'As prescribed by Dr. Sato: 1 tablet with food',
      startDate: today, schedules: [{ localTime: '08:00' }, { localTime: '20:00' }],
    });
    assert.equal(res.status, 201);
    const medId = res.body.medication.id;

    const reminders = await Reminder.find({ sourceType: 'medication', sourceId: medId });
    assert.equal(reminders.length, 2);
    assert.ok(reminders.every((r) => r.recurrence === 'daily' && r.timezone === 'Asia/Tokyo'));

    // register a device, then run the scheduler "two days from now"
    await api().put('/v1/me/devices').set(u.auth).send({ pushToken: 'ExponentPushToken[abcdefghijkl]', platform: 'ios' });
    pushed.length = 0;
    const future = new Date(Date.now() + 2 * 86_400_000);
    const delivered = await processDueReminders({ now: future });
    assert.ok(delivered >= 2);
    assert.ok(pushed.some((m) => m.title.includes('Medication time') && m.title.includes('Coco')));

    // running again must not double-send
    pushed.length = 0;
    assert.equal(await processDueReminders({ now: future }), 0);
    assert.equal(pushed.length, 0);

    // in-app notification exists and reminder is pending
    const inbox = await api().get('/v1/me/notifications').set(u.auth);
    assert.ok(inbox.body.items.length >= 2);
    assert.ok(inbox.body.unread >= 2);

    const pending = await api().get('/v1/reminders?scope=pending').set(u.auth);
    assert.equal(pending.body.items.length, 2);
    assert.ok(pending.body.items.every((r) => r.isPending));

    const first = pending.body.items[0];
    const done = await api().post(`/v1/reminders/${first.id}/complete`).set(u.auth).send({ action: 'done' });
    assert.equal(done.status, 200);
    assert.equal(done.body.reminder.isPending, false);
    assert.equal(done.body.reminder.status, 'active'); // daily med keeps going

    const skip = await api().post(`/v1/reminders/${pending.body.items[1].id}/complete`).set(u.auth).send({ action: 'skip' });
    assert.equal(skip.status, 200);

    const doses = await api().get(`/v1/pets/${pet.id}/medications/${medId}/doses`).set(u.auth);
    assert.equal(doses.body.items.length, 2);
    assert.deepEqual(doses.body.items.map((d) => d.outcome).sort(), ['given', 'skipped']);
  });

  test('finishing a course silences reminders; end date auto-completes it', async () => {
    const u = await signup();
    const pet = await createPet(u);
    const today = tokyoToday();
    const m = await api().post(`/v1/pets/${pet.id}/medications`).set(u.auth).send({
      name: 'Antibiotic', startDate: today, schedules: [{ localTime: '09:00' }],
    });
    const id = m.body.medication.id;
    assert.equal(await Reminder.countDocuments({ sourceId: id, status: 'active' }), 1);
    const fin = await api().post(`/v1/pets/${pet.id}/medications/${id}/finish`).set(u.auth).send({});
    assert.equal(fin.body.medication.status, 'completed');
    assert.equal(await Reminder.countDocuments({ sourceId: id }), 0);

    // ends yesterday-relative: one-day course with end date today completes after its last dose
    const m2 = await api().post(`/v1/pets/${pet.id}/medications`).set(u.auth).send({
      name: 'Short course', startDate: today, endDate: today, schedules: [{ localTime: '23:59' }],
    });
    const id2 = m2.body.medication.id;
    const far = new Date(Date.now() + 3 * 86_400_000);
    await processDueReminders({ now: far });
    const rem = await Reminder.findOne({ sourceId: id2 });
    assert.ok(rem.pendingDueAt, 'notified');
    assert.equal(rem.isFinal, true, 'no further occurrences after end date');
    const done = await api().post(`/v1/reminders/${rem.id}/complete`).set(u.auth).send({ action: 'done' });
    assert.equal(done.body.reminder.status, 'completed');
    assert.equal((await Medication.findById(id2)).status, 'completed');
    assert.equal(await MedicationDose.countDocuments({ medicationId: id2 }), 1);
  });

  test('another user cannot touch my reminders', async () => {
    const a = await signup();
    const b = await signup();
    const r = await api().post('/v1/reminders').set(a.auth).send({
      kind: 'grooming', title: 'Bath', date: '2030-01-01', localTime: '10:00',
    });
    assert.equal(r.status, 201);
    const id = r.body.reminder.id;
    assert.equal((await api().post(`/v1/reminders/${id}/complete`).set(b.auth).send({})).status, 404);
    assert.equal((await api().delete(`/v1/reminders/${id}`).set(b.auth)).status, 404);
    assert.equal((await api().get('/v1/reminders').set(b.auth)).body.items.length, 0);
  });
});

describe('vaccinations, appointments, feeding', () => {
  test('vaccination with next due date schedules a reminder; deleting removes it', async () => {
    const u = await signup();
    const pet = await createPet(u);
    const due = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
    const v = await api().post(`/v1/pets/${pet.id}/vaccinations`).set(u.auth).send({
      name: 'Rabies', administeredOn: '2025-11-01', nextDueOn: due, clinicName: 'Sakura Vet',
    });
    assert.equal(v.status, 201);
    assert.equal(await Reminder.countDocuments({ sourceType: 'vaccination', sourceId: v.body.vaccination.id }), 1);

    const bad = await api().post(`/v1/pets/${pet.id}/vaccinations`).set(u.auth).send({
      name: 'X', administeredOn: '2025-11-01', nextDueOn: '2025-01-01',
    });
    assert.equal(bad.status, 400);

    await api().delete(`/v1/pets/${pet.id}/vaccinations/${v.body.vaccination.id}`).set(u.auth);
    assert.equal(await Reminder.countDocuments({ sourceType: 'vaccination', sourceId: v.body.vaccination.id }), 0);
    assert.equal((await api().get(`/v1/pets/${pet.id}/vaccinations`).set(u.auth)).body.items.length, 0);
  });

  test('appointment reminder follows reschedule and cancellation', async () => {
    const u = await signup();
    const pet = await createPet(u);
    const at = new Date(Date.now() + 3 * 86_400_000);
    const a = await api().post(`/v1/pets/${pet.id}/appointments`).set(u.auth).send({
      clinicName: 'Sakura Vet', scheduledAt: at.toISOString(), reminderMinutesBefore: 120,
    });
    const id = a.body.appointment.id;
    let r = await Reminder.findOne({ sourceId: id });
    assert.equal(r.nextDueAt.getTime(), at.getTime() - 120 * 60_000);

    const later = new Date(at.getTime() + 86_400_000);
    await api().patch(`/v1/pets/${pet.id}/appointments/${id}`).set(u.auth).send({ scheduledAt: later.toISOString() });
    r = await Reminder.findOne({ sourceId: id });
    assert.equal(r.nextDueAt.getTime(), later.getTime() - 120 * 60_000);

    await api().patch(`/v1/pets/${pet.id}/appointments/${id}`).set(u.auth).send({ status: 'cancelled' });
    assert.equal(await Reminder.countDocuments({ sourceId: id }), 0);
  });

  test('feeding schedule creates a daily reminder; deleting pet cancels all reminders', async () => {
    const u = await signup();
    const pet = await createPet(u);
    const f = await api().post(`/v1/pets/${pet.id}/feeding`).set(u.auth).send({ label: 'Breakfast', localTime: '07:30' });
    assert.equal(f.status, 201);
    assert.equal(await Reminder.countDocuments({ petId: pet.id, status: 'active' }), 1);
    await api().delete(`/v1/pets/${pet.id}`).set(u.auth);
    assert.equal(await Reminder.countDocuments({ petId: pet.id }), 0);
  });
});

describe('documents', () => {
  test('uploads are refused (503) rather than faked when storage is not configured', async () => {
    const u = await signup();
    const pet = await createPet(u);
    const res = await api().post(`/v1/pets/${pet.id}/documents`).set(u.auth).send({
      filename: 'cert.pdf', contentType: 'application/pdf', sizeBytes: 1000,
    });
    assert.equal(res.status, 503);
    const bad = await api().post(`/v1/pets/${pet.id}/documents`).set(u.auth).send({
      filename: 'x.exe', contentType: 'application/x-msdownload', sizeBytes: 1000,
    });
    assert.equal(bad.status, 400);
  });
});

describe('home, profile, privacy', () => {
  test('home aggregates only real data', async () => {
    const u = await signup();
    const empty = await api().get('/v1/home').set(u.auth);
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body.pets, []);
    assert.equal(empty.body.nextAppointment, null);
    assert.equal(empty.body.greetingName, u.user.profile.displayName);
    assert.equal(empty.body.entitlements.features.petCare, true);

    const pet = await createPet(u);
    await api().post(`/v1/pets/${pet.id}/appointments`).set(u.auth).send({
      clinicName: 'Sakura Vet', scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const home = await api().get('/v1/home').set(u.auth);
    assert.equal(home.body.pets.length, 1);
    assert.equal(home.body.nextAppointment.clinicName, 'Sakura Vet');
  });

  test('profile update is partial and validated; consents are appended', async () => {
    const u = await signup();
    const r = await api().patch('/v1/me').set(u.auth).send({ preferences: { weightUnit: 'lb' }, profile: { prefecture: '13' } });
    assert.equal(r.body.user.preferences.weightUnit, 'lb');
    assert.equal(r.body.user.profile.prefecture, '13');
    assert.equal(r.body.user.profile.displayName, u.user.profile.displayName, 'siblings untouched');
    assert.equal((await api().patch('/v1/me').set(u.auth).send({ role: 'admin' })).status, 400, 'cannot self-promote');
    assert.equal((await api().patch('/v1/me').set(u.auth).send({ timezone: 'Mars/Base' })).status, 400);

    const c = await api().post('/v1/me/consents').set(u.auth).send({ kind: 'location', granted: true });
    assert.ok(c.body.user.consents.some((x) => x.kind === 'location' && x.granted));
  });

  test('export contains my data; delete erases it and frees the email', async () => {
    const u = await signup();
    const pet = await createPet(u);
    await api().post(`/v1/pets/${pet.id}/weights`).set(u.auth).send({ value: 10 });
    const exp = await api().get('/v1/me/export').set(u.auth);
    assert.equal(exp.body.pets.length, 1);
    assert.equal(exp.body.weights.length, 1);
    assert.equal(exp.body.user.passwordHash, undefined);

    assert.equal((await api().delete('/v1/me').set(u.auth).send({ password: 'wrong-password' })).status, 401);
    assert.equal((await api().delete('/v1/me').set(u.auth).send({ password: u.password })).status, 204);

    assert.equal((await api().get('/v1/me').set(u.auth)).status, 401);
    assert.equal((await api().post('/v1/auth/login').send({ email: u.email, password: u.password })).status, 401);
    const again = await api().post('/v1/auth/register').send({
      email: u.email, password: u.password, displayName: 'Back', acceptTerms: true, acceptPrivacy: true,
    });
    assert.equal(again.status, 201);
  });
});
