// Server-generated notification / reminder text. English only for now; the `locale` argument is kept
// so another language can be added later without touching call sites.
const en = {
  medication: ({ pet, name }) => ({ title: `Medication time: ${pet}`, body: name }),
  vaccination: ({ pet, name }) => ({ title: `Vaccination due soon: ${pet}`, body: name }),
  appointment: ({ pet, clinic }) => ({ title: `Vet appointment: ${pet}`, body: clinic }),
  feeding: ({ pet, label }) => ({ title: `Meal time: ${pet}`, body: label }),
  event: ({ title, place }) => ({ title: `Event starting soon: ${title}`, body: place }),
  eventUpdated: ({ title }) => ({ title, body: 'Event details were updated' }),
  eventCancelled: ({ title }) => ({ title, body: 'This event was cancelled' }),
  membershipActive: () => ({ title: 'Welcome to the community', body: 'Your payment was confirmed. Community access is unlocked.' }),
};

export const tr = (_locale, key, vars) => en[key](vars);
