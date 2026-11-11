# PawCircle

A social fitness & lifestyle community for pet owners (Japan first, dogs and cats).
*Better Together. Happier Paws. Healthier Lives.*

```
petcare/
├── backend/    Node.js + Express + MongoDB (Mongoose), plain JavaScript, MVC
├── frontend/   React Native + Expo (Expo Router), plain JavaScript
└── .data/      local mongod data dir (git-ignored)
```

## Status — Phase 1 (product foundations) is built

| Area | State |
|---|---|
| **Sign in with Nimiq Pay** (wallet signature verified server-side, one-time challenges, account = wallet address; no email or password) | done, tested; **not yet run against the real Nimiq Pay app** |
| Sessions (refresh-token rotation + reuse detection, consent records) | done, tested |
| Owner profile, preferences, notification prefs | done |
| Pet profiles (dog/cat), multi-pet | done |
| Weight tracking (kg/lb/g, chart, history, pagination) | done |
| Medication (user-entered instructions only, schedules, dose history, finish) | done |
| Vaccinations, vet appointments, feeding schedules, custom reminders | done |
| Reminder engine + background worker (atomic claim, push + in-app inbox) | done, tested |
| Account export + permanent deletion (APPI) | done |
| English UI (Asia/Tokyo scheduling, prefecture-based locations) | done |
| Home, Community, Activities, My Pet, central paw quick-action sheet | done (see below) |
| **Paid community** — 1 NIM one-time unlock via Nimiq Pay, verified on-chain by the server | done, tested (fake node); **not yet run against a real Nimiq payment** |
| **Community**: discovery (popular / search / nearby by prefecture), groups with roles, member posts, comments, likes | done, tested |
| **Events**: member-hosted events, RSVP with capacity guarantees, reminders, host cancel / completion report, official event ideas | done, tested |
| **Safety**: report (auto-hide at 3 reporters), block, rate limits, admin moderation API | done, tested |
| Health-document uploads (signed URLs, Cloudflare R2) | API done; **no app UI yet**; needs R2 credentials |
| **Weekly challenges + leaderboards** (admin-posted, self-reported entries, dogs/cats split, global / local / community boards) | done, tested |
| **Chat**: Everyone, Local (by prefecture) and Community rooms, live over WebSocket with polling fallback | done, tested |
| GPS walk tracking, subscriptions beyond the NIM unlock, full admin dashboard UI | **not built** (Phases 2 and 6) |
| Direct messages, photo/video posts, event photo sharing, edit-event / edit-community screens | **not built** |

**No fake data in real flows.** Activities and the "today's walk / challenge" cards on Home are not
built yet (Community is real). By default they show honest empty states. With
`EXPO_PUBLIC_DEMO_MODE=1` (the default in `frontend/.env`) they render sample content behind a
yellow **DEMO DATA** ribbon so the design can be reviewed. The sample lives only in
`frontend/src/demo/fixtures.js` and is never sent to or mixed with the backend.
Turn it off with `EXPO_PUBLIC_DEMO_MODE=0`.

Illustrations are placeholders (emoji on pastel shapes). Replace the body of `PetAvatar` / `Hero`
in `frontend/src/components/pets.js` with real artwork when available.

## Run it

Requires Node 22+ and MongoDB.

```bash
# 1) MongoDB (project-local instance on :27018, leaves any system mongod alone)
mkdir -p .data/mongo
mongod --dbpath .data/mongo --port 27018 --bind_ip 127.0.0.1 --fork --logpath .data/mongod.log

# 2) API (http://localhost:4000)
cd backend && cp .env.example .env && npm install
npm run dev
npm run worker      # separate process: delivers due reminders (safe to run several)
npm run seed        # official event ideas + 6 empty starter communities (re-runnable)
npm test            # 86+ tests (see below) against a throwaway DB (pawcircle_test)
npm run make-admin -- "NQ.. wallet address"   # grant moderation rights (the wallet must have signed in once)
npm run grant-membership -- "NQ.. wallet address"   # comp community access (staff / local testing, no payment)

# 3) App
cd frontend && npm install
npx expo start      # press w for web, or scan the QR with Expo Go
```

Android emulators reach the API at `http://10.0.2.2:4000` (handled automatically). On a physical
phone set `EXPO_PUBLIC_API_URL=http://<your-computer-LAN-ip>:4000` in `frontend/.env`.

## Backend architecture (MVC)

```
src/
├── models/        Mongoose schemas (the M): User, Pet, PetWeight, Medication(+Dose), Vaccination,
│                  Appointment, HealthDocument, FeedingSchedule, Reminder, Notification, Device,
│                  RefreshToken, AuditLog
├── controllers/   request handlers (the C) — thin; call services
├── views/         JSON presenters (the V) — the only place that decides which fields leave the API
├── routes/        URL → middleware → controller wiring (/v1/...)
├── validators/    zod request schemas
├── middleware/    auth, validation, ownership loaders, rate limits, error mapping
├── services/      business logic: auth, reminders/scheduler, push, storage (R2), account, entitlements
├── utils/         recurrence (timezone-correct), pagination (keyset), password (scrypt), tokens, i18n
├── app.js         express app          server.js   API entry          worker.js   reminder worker
```

Design decisions worth knowing:

- **Ownership**: every pet-scoped route loads the pet through `loadOwnedPet`; someone else's
  resource is a 404 (not 403) so ids can't be probed.
- **Reminders** store a UTC instant plus the owner's IANA timezone and local wall-clock time, so
  recurrence is computed in local time. A notified occurrence becomes `pendingDueAt` until the user
  marks it done/skipped; completing a medication reminder writes the dose history.
- **Medication safety**: dosage text is stored exactly as entered; nothing is suggested or computed.
- **Privacy**: only a prefecture/city is stored (no address, no live location); medical files are
  private and served by 5-minute signed URLs; storage keys never appear in API responses.
- **Entitlements** are server-side (`services/entitlementService.js`). Everyone is on the free
  Explorer plan until Phase 6 adds verified App Store / Google Play receipts. Pet-care records and
  reminders are never gated.
- **Push** uses Expo's push service (relays to FCM/APNs). Registering a real device token needs an
  EAS project id (`eas init`), then `extra.eas.projectId` in `app.json`.

## Frontend architecture

```
src/
├── app/          Expo Router screens (views): (auth)/, onboarding, (tabs)/, form modals
├── components/   design-system pieces (ui.js, pets.js, TabBar, WeightChart, ReminderRow)
├── theme/        colour / spacing / type tokens from the reference screens
├── api/          client.js (token refresh, single-flight) + resources.js (model layer)
├── hooks/        react-query controllers
├── state/        AuthContext, PetContext
├── i18n/         ja.json (default), en.json
└── demo/         clearly-labelled sample content for unbuilt features
```

## Next up — Phase 2 (fitness)

GPS walk tracker (owner vs. pet activity kept distinct), activity history and goals, location
permission requested only when a walk starts. This replaces the Home "Today's Walk" demo card and
the Activities empty state.

## Known gaps / follow-ups

- Dates/times use text inputs with auto-formatting; swap in native pickers during UI polish.
- No app UI yet for health-document upload, pet photo upload, or editing an existing pet.
- Web build was verified end-to-end in a browser; **native iOS/Android builds have not been run**.
- Forgot-password / email verification need an email provider and are not implemented.
- Display times use Asia/Tokyo; the scheduler already honours each user's own timezone.

## Community (Phase 5 slice)

- **Community is a paid feature** (see *Membership & Nimiq payments* below). Everything under it — groups,
  posts, comments, events, event ideas — returns HTTP 402 `membership_required` without a membership. Leaving
  a group, withdrawing from an event, reporting and blocking stay open so a lapsed member can always get out.
- **"Nearby"** uses the member's prefecture (JIS code), never an address. Events must be at a public
  venue — hosts confirm this when publishing, and no member address is ever collected or shown.
- **Moderation**: three distinct reporters auto-hide a post / comment / event until a platform admin
  reviews it. Operators use `GET /v1/admin/reports`, `POST /v1/admin/reports/:id/resolve`
  (`hide` | `dismiss`), `PUT /v1/admin/event-ideas`, `PATCH /v1/admin/communities/:id`,
  `POST /v1/admin/events/:id/feature`. The dashboard UI is Phase 6.
- **Starter communities** are created by the seed script with 0 members and 0 posts. Nothing is
  pre-populated with invented activity.
- **Capacity** for events is enforced with an atomic seat claim, so concurrent sign-ups can never
  exceed the limit (covered by a concurrency test).

## Membership & Nimiq payments

Community access costs **1 NIM per month** by default. Change the price with `MEMBERSHIP_PRICE_NIM` in
`backend/.env` (e.g. `2.5`; up to 5 decimals; restart the API) — the app reads the price from the server, so nothing
else changes. Set `MEMBERSHIP_DAYS` for time-limited access instead. A payment request keeps the price it was
issued at, so a change never affects someone who is mid-payment. Pet care, reminders and health records are always free, even for lapsed members.

**How a payment is verified** (`backend/src/services/nimiqService.js`, `membershipController.js`):

1. The app asks for a *payment request*: the server returns your receiving address, the amount and a unique
   reference like `PAW-7F3K9Q2M8XJ4`.
2. The member pays that amount with the reference as the transaction message — one tap inside Nimiq Pay
   (`sendBasicTransactionWithData`), or manually from any Nimiq wallet.
3. The server reads the transaction **from a Nimiq node** (`getTransactionByHash`, or searches
   `getTransactionsByAddress` by reference) and checks: recipient is ours, value ≥ price, the message matches this
   request, it executed successfully, and it has `NIMIQ_MIN_CONFIRMATIONS` confirmations. A client saying "I paid" —
   or a hash from the wallet, which the docs say is not proof of finality — never unlocks anything by itself.
4. The request is claimed atomically; a unique index on the transaction hash means one transaction can only ever
   fund one request. Payments arriving after the request's 60 minutes are still honoured.

**To turn payments on** (otherwise the app says "Payments aren't available yet" and nobody can pay):

```bash
# backend/.env
NIMIQ_RECEIVE_ADDRESS="NQ.. .... ...."   # YOUR wallet. The checksum is validated; a typo disables payments
NIMIQ_RPC_URL=https://your-node:8648     # a Nimiq node's JSON-RPC. Public open servers are for testing only
NIMIQ_NETWORK=mainnet                    # or testnet while testing
```

**Running inside Nimiq Pay (one-tap payments).** Nimiq Pay mini apps are web apps loaded in its web view, so build
the web version and host it:

```bash
cd frontend && EXPO_PUBLIC_API_URL=https://api.yourdomain.com npx expo export --platform web   # serve dist/ over HTTPS
```

Then in Nimiq Pay open **Mini Apps → Custom URL**, or share `nimiqpay://miniapp?url=your-app.com`. Add that origin
to the backend's `CORS_ORIGINS`. For testnet, Nimiq Pay has a hidden dev menu (long-press the settings button for
10 seconds). Outside Nimiq Pay (native app, normal browser) the unlock screen shows the address, amount and message
to pay from any Nimiq wallet, plus an "I've paid" check.

**Honest limits**
- Verified against the real node API shapes (I read live responses) and a fake node in automated tests, including
  wrong recipient / short payment / wrong message / failed tx / replay / concurrent verification. **I have not made a
  real NIM payment or loaded the app inside the real Nimiq Pay app.** Try a testnet payment before launch.
- Apple and Google require their own in-app purchase for digital content unlocked inside store apps. Selling
  community access for crypto may be rejected on iOS/Android; the Nimiq Pay mini-app route is not subject to that.
- Refunds, receipts and tax handling for NIM payments are not implemented.
- The price is fixed in NIM, so its fiat value moves with the NIM market.

## Deploying

See **[DEPLOY.md](DEPLOY.md)** for the step-by-step Render guide (MongoDB Atlas, one service that serves the API, the web app and
live chat, Nimiq payment setup, troubleshooting) and `render.yaml` for the Blueprint. Locally, after `npm run build:web`, running
the backend (`npm start`) serves the whole app at its own address.

## Challenges & leaderboards

The PawCircle admin team posts challenges (weekly by convention) — there are **no rewards**; the leaderboard is the point.

- **Posting:** make yourself an admin (`npm run make-admin -- you@example.com`), then *Settings → Admin → Manage weekly
  challenges → Post a challenge*. "This week / Next week" fill the Monday–Sunday dates. Drafts stay private until published;
  you can unpublish, edit, delete, and review/remove individual entries (biggest first, so implausible ones stand out).
- **What they measure:** distance (km), active minutes, active days (one check-in per day) or check-ins. The score is the sum
  of a member's entries. Dates are calendar days in Japan time; the last day is inclusive.
- **Fairness and safety:** each challenge has a per-entry and a per-day limit (sensible defaults per metric), entries can be
  back-dated at most 7 days, and are rate limited. Dogs and cats can be ranked separately (and a challenge can be dog-only or
  cat-only), so different pets aren't pitted against each other. Ties share a rank (1, 1, 3).
- **Boards:** *Everyone*, *My area* (same prefecture) and *My community*, each filterable by dogs / cats, always showing
  where *you* stand even below the top. Ended challenges keep their final results and lock further changes.
- **Honest limit:** until GPS walk tracking exists (Phase 2), entries are **self-reported** — an honour system backed by the
  caps above, members being able to delete their own entries, and admin removal. When walks are tracked, those entries can be
  auto-verified.
- Challenges are part of the paid community (same 1 NIM unlock).

## Chat

Three kinds of room, all inside the paid community: **Everyone**, **Local** (`local:<prefecture>` — only people whose profile
area matches) and **Community** (`community:<id>` — members only). Messages are limited to 500 characters, rate limited (20 per
minute, no repeating the same text within 15 s), can be reported (3 reporters auto-hide) or blocked, and are deleted
automatically after 60 days.

Messages are created through the REST API (so validation, limits and moderation live in one place) and pushed live over a
WebSocket (`/v1/chat/ws`, authenticated with the same access token; it is closed when the token expires and the app
reconnects). If the socket can't connect, the app polls every few seconds, so chat keeps working either way.

**Scaling note:** the live-delivery room map lives in one API process. Running several API instances needs a shared pub/sub
(Redis) between them so a message reaches sockets connected to other instances — not built yet.

## Sign-in

Accounts are Nimiq wallets. The app calls Nimiq Pay's `sign()` on a one-time server challenge; the server verifies the Ed25519
signature, derives the address (BLAKE2b-256 of the public key, checked against 12 real mainnet transactions) and signs the
person in. A returning wallet gets its account back; a new wallet creates one (consent required). Challenges expire in 5
minutes and work once; replays, forged keys and tampered messages are rejected (see `backend/tests/nimiq-auth.test.js`).

Email + password still exists **only** for local development and tests: set `ENABLE_PASSWORD_AUTH=1` in `backend/.env`. It is
off by default and off in `render.yaml`, where those endpoints return 404.

**Honest limit:** Nimiq's docs say to verify `sign()`'s signature but don't state its byte format. The server accepts Nimiq's
documented signed-message format and three close variants (safe because every message carries a fresh nonce). Real Nimiq Pay
sign-in has not been tested; the server logs which format matched on the first real sign-in.
