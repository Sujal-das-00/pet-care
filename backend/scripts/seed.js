// Publishes PawCircle's official content: the event ideas from the product brief and a few
// *empty* starter communities (0 members, 0 posts — no invented activity). Safe to re-run.
//   npm run seed              adds anything missing; never overwrites existing content (safe on every deploy)
//   npm run seed -- --force   also resets the official event ideas to the shipped text
import { connectDb, disconnectDb } from '../src/config/db.js';
import { EventIdea } from '../src/models/Event.js';
import { Community } from '../src/models/Community.js';

const SAFETY = [
  'Meet in a busy public place such as a park — never a private home.',
  'Only bring pets that are vaccinated and feeling well.',
  'Keep pets leashed or in carriers, and only let them greet when both owners agree.',
  'Bring water and waste bags, and avoid very hot or cold hours.',
  'Hosts organise independently; PawCircle provides the platform and guidelines, not on-site supervision.',
];

const idea = (key, category, emoji, group, minutes, pets, en, order) => ({
  key, category, emoji, recommendedGroupSize: group, suggestedDurationMinutes: minutes, petTypes: pets, order,
  en: { ...en, safety: SAFETY },
});

const IDEAS = [
  idea('monthly-paw-walk', 'monthly_paw_walk', '🐾', { min: 5, max: 30 }, 90, ['dog', 'cat'], {
    title: 'Monthly Paw Walk', concept: 'PawCircle’s recurring monthly walk, hosted by members in their own neighbourhoods.',
    format: 'A relaxed loop around a park plus a group photo',
    instructions: 'Pick a meeting point and time, walk one shared route, and finish with a group photo to share.',
    locationRequirements: 'A large park with good paths, toilets and somewhere to rest.', photoSuggestions: 'One group photo with every person and pet.',
  }, 1),
  idea('pet-picnic', 'picnic', '🧺', { min: 4, max: 20 }, 120, ['dog', 'cat'], {
    title: 'Weekend Pet Picnic', concept: 'Lay out a blanket and get to know each other.', format: 'A picnic on the grass',
    instructions: 'Everyone brings their own food and drinks. Keep human food away from pets.',
    locationRequirements: 'A pet-friendly lawn area with some shade.', photoSuggestions: 'A photo around the picnic blanket.',
  }, 2),
  idea('dog-park-meetup', 'dog_park', '🐕', { min: 4, max: 15 }, 90, ['dog'], {
    title: 'Dog Park Meetup', concept: 'Let the dogs play and meet other owners.', format: 'Free play at a dog run',
    instructions: 'Check the park rules first and respect the small and large dog areas.',
    locationRequirements: 'Some parks require vaccination proof — check beforehand.', photoSuggestions: 'A happy running shot.',
  }, 3),
  idea('cat-lovers-gathering', 'cat_gathering', '🐱', { min: 3, max: 12 }, 90, ['cat'], {
    title: 'Cat Lovers Gathering', concept: 'A café chat about life with cats (cats stay safely at home).', format: 'Coffee and conversation',
    instructions: 'Leave cats at home and share photos, videos and tips.',
    locationRequirements: 'A quiet public café that is easy to chat in.', photoSuggestions: 'Bring cat photos or favourite toys.',
  }, 4),
  idea('pet-photography-day', 'photo_day', '📸', { min: 4, max: 20 }, 90, ['dog', 'cat'], {
    title: 'Pet Photography Day', concept: 'Swap photo-taking at a scenic spot.', format: 'A photo walk',
    instructions: 'Use treats and toys to get attention and take turns shooting.',
    locationRequirements: 'A pretty park or tree-lined path.', photoSuggestions: 'Post your favourite shot to the community.',
  }, 5),
  idea('breed-meetup', 'breed_meetup', '🏅', { min: 4, max: 25 }, 120, ['dog', 'cat'], {
    title: 'Breed Meetup', concept: 'Meet others who share your pet’s breed.', format: 'A get-together in a park',
    instructions: 'Swap tips about grooming and breed-specific quirks.', locationRequirements: 'A spacious park.', photoSuggestions: 'A line-up of the same breed.',
  }, 6),
  idea('community-fitness-walk', 'fitness_walk', '👟', { min: 4, max: 25 }, 60, ['dog'], {
    title: 'Community Fitness Walk', concept: 'A brisk walk that’s good for people and pets.', format: 'A 4–5 km walk',
    instructions: 'Match the pace of the slowest walker and take water breaks.', locationRequirements: 'A loop route with proper footpaths.', photoSuggestions: 'A high-five at the finish.',
  }, 7),
  idea('pet-birthday-gathering', 'birthday', '🎂', { min: 3, max: 12 }, 90, ['dog', 'cat'], {
    title: 'Pet Birthday Gathering', concept: 'Celebrate a friend’s birthday together.', format: 'A small party in the park',
    instructions: 'Check ingredients in pet cakes and treats and watch for allergies.', locationRequirements: 'A pet-friendly public space.', photoSuggestions: 'The birthday pet with their cake.',
  }, 8),
  idea('group-adventure-day', 'adventure', '🥾', { min: 4, max: 20 }, 240, ['dog'], {
    title: 'Group Adventure Day', concept: 'Go a little further for a hike or day trip.', format: 'A half-day hike or outing',
    instructions: 'Scout the route first and make sure it’s suitable for pets. Plan around the least fit participant.',
    locationRequirements: 'Pet-friendly trails or venues.', photoSuggestions: 'Everyone with the view behind.',
  }, 9),
];

const STARTERS = [
  { name: 'Tokyo Dog Lovers', description: 'Dog owners in Tokyo. Find walking buddies near you.', kind: 'city', species: 'dog', prefecture: '13', emoji: '🐶', tint: 'peach' },
  { name: 'Tokyo Cat Parents', description: 'A community for people living with cats in Tokyo.', kind: 'city', species: 'cat', prefecture: '13', emoji: '🐱', tint: 'lavender' },
  { name: 'Osaka Pet Lovers', description: 'Pet people of Osaka, all welcome.', kind: 'city', species: 'any', prefecture: '27', emoji: '🐾', tint: 'yellow' },
  { name: 'Shiba Inu Community Japan', description: 'Shiba owners, assemble!', kind: 'breed', species: 'dog', breed: 'Shiba Inu', emoji: '🦊', tint: 'peach' },
  { name: 'Golden Retriever Club', description: 'Tips and meetups for Golden Retriever families.', kind: 'breed', species: 'dog', breed: 'Golden Retriever', emoji: '🐕', tint: 'yellow' },
  { name: 'Weekend Paw Walkers', description: 'Looking for people to walk with on weekends.', kind: 'activity', species: 'any', emoji: '🚶', tint: 'green' },
];

await connectDb();

// Clean up earlier non-English starters (only the untouched, empty official ones).
const untouched = await Community.find({ official: true, memberCount: 0, postCount: 0 }).select('name').lean();
const staleIds = untouched.filter((c) => /[^\u0000-ɏ]/.test(c.name)).map((c) => c._id);
const stale = await Community.deleteMany({ _id: { $in: staleIds } });

// Drop the old Japanese fields (no longer in the schema, so go through the raw collection).
await EventIdea.collection.updateMany({}, { $unset: { ja: '' } });
const force = process.argv.includes('--force');
for (const i of IDEAS) await EventIdea.updateOne({ key: i.key }, force ? { $set: i } : { $setOnInsert: i }, { upsert: true });
for (const c of STARTERS) {
  await Community.updateOne({ name: c.name, official: true }, { $setOnInsert: { ...c, official: true, memberCount: 0, postCount: 0 } }, { upsert: true });
}
console.log(`Seeded ${IDEAS.length} event ideas and ${STARTERS.length} official starter communities (empty). Removed ${stale.deletedCount} old non-English starters.`);
await disconnectDb();
