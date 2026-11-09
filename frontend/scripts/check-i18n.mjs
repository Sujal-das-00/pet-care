// Verifies every t('key') used in src/ exists in en.json (the only language).   node scripts/check-i18n.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const load = (l) => JSON.parse(fs.readFileSync(`${root}/src/i18n/${l}.json`, 'utf8'));
const langs = { en: load('en') };
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
const sets = Object.fromEntries(Object.entries(langs).map(([l, o]) => [l, new Set(flat(o))]));

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
const has = (set, key) => set.has(key) || set.has(`${key}_other`); // plural forms

// Keys built from a variable: prefix -> the values it can take.
const families = {
  'home.shortcuts.': ['petCare', 'fitness', 'challenges', 'events'],
  'interests.': ['walks', 'fitness', 'photography', 'training', 'meetups', 'hiking', 'cats', 'adoption'],
  'pet.genders.': ['male', 'female', 'unknown'], 'pet.species.': ['dog', 'cat'],
  'quick.': ['walk', 'post', 'event', 'weight', 'activity'],
  'reminders.kinds.': ['grooming', 'weight', 'general', 'custom'], 'reminders.rec.': ['none', 'daily', 'weekly', 'monthly', 'yearly'],
  'settings.cat.': ['care', 'fitness', 'community', 'challenges', 'events', 'marketing'], 'settings.plan.': ['explorer', 'club', 'elite'],
  'settings.push.': ['granted', 'denied', 'unsupported', 'no_project'], 'tabs.': ['home', 'community', 'activities', 'pet'],
  'traits.': ['playful', 'calm', 'shy', 'energetic', 'friendly', 'curious'], 'days.': ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  'events.cat.': ['monthly_paw_walk', 'picnic', 'dog_park', 'cat_gathering', 'photo_day', 'breed_meetup', 'fitness_walk', 'birthday', 'adventure', 'other'],
  'events.status.': ['scheduled', 'cancelled', 'completed'], 'events.scope.': ['upcoming', 'mine'],
  'challenges.status.': ['active', 'upcoming', 'ended'], 'leaderboard.scope.': ['global', 'local', 'community'],
  'admin.metric.': ['distance_km', 'activity_minutes', 'active_days', 'check_ins'], 'chat.sub.': ['global', 'local', 'community'],
  'unlock.reasons.': ['wrong_recipient', 'amount_too_low', 'wrong_reference', 'transaction_failed'],
  'community.kinds.': ['general', 'city', 'breed', 'activity', 'interest'],
  'safety.reasons.': ['spam', 'harassment', 'inappropriate', 'unsafe_event', 'privacy', 'other'],
};

const used = new Set();
for (const f of walk(`${root}/src`)) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*([`'"])([^`'"]+)\1/g)) used.add(m[2]);
}

const problems = [];
for (const key of [...used]) {
  if (!key.includes('${')) continue;
  used.delete(key);
  const prefix = key.slice(0, key.indexOf('${'));
  if (prefix === 'onboarding.s') { for (const i of '01234') for (const x of ['title', 'body']) used.add(`onboarding.s${i}.${x}`); continue; }
  if (!families[prefix]) { problems.push(`UNMAPPED dynamic key: ${key}`); continue; }
  for (const v of families[prefix]) used.add(prefix + v);
}
for (const k of used) for (const l of Object.keys(sets)) if (!has(sets[l], k)) problems.push(`${l} is missing: ${k}`);

if (problems.length) { console.log([...new Set(problems)].sort().join('\n')); process.exit(1); }
console.log(`OK: ${used.size} keys used; all present in en.json`);
