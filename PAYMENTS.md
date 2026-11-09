# PawCircle Payments — Implementation Reference

Handover document for anyone implementing payments in another codebase using this one as the reference.
Everything below is taken from the code in this repo; file paths are given so you can read the source alongside.

---

## 1. Summary

| Question | Answer |
|---|---|
| What is sold? | One feature: **Community** access (groups, posts, comments, events, event ideas, challenges). Pet care is always free. |
| Currency | **NIM** (Nimiq cryptocurrency). Smallest unit is **Luna**: `1 NIM = 100,000 Luna`. |
| Payment provider | **None.** There is no Stripe/PayPal/processor. The user pays directly on the Nimiq blockchain. |
| Wallet / client SDK | **Nimiq Pay** mini-app SDK: `@nimiq/mini-app-sdk` `^0.2.5` (frontend only). |
| Server-side "SDK" | **None.** The backend talks to a Nimiq node over plain **JSON-RPC** using `fetch`. |
| Settlement | The user's NIM goes **wallet → wallet, on-chain**, straight to the merchant's receiving address (`NIMIQ_RECEIVE_ADDRESS`). No custody, no payout step, no fees paid to a processor. |
| Price | `MEMBERSHIP_PRICE_NIM` (default `1`), one-time by default (`MEMBERSHIP_DAYS=0` = lifetime). |
| Source of truth for "is paid" | Only the **server's blockchain check**. The client saying "I paid" never unlocks anything. |
| Identity | Accounts *are* Nimiq wallets (sign-in by signed message). See §8. |
| Status | Tested with a **fake node** in automated tests. **Never run against a real NIM payment or the real Nimiq Pay app** (see §11). |

---

## 2. Settlement — how money actually moves

```
 User's Nimiq Pay wallet ──(on-chain tx: value, message=reference)──►  Merchant wallet (NIMIQ_RECEIVE_ADDRESS)
                                         │
                                         ▼
                              Nimiq blockchain (public)
                                         ▲
   PawCircle backend ── JSON-RPC (getTransactionByHash / getTransactionsByAddress) ── Nimiq node (NIMIQ_RPC_URL)
```

- **Settlement is the blockchain transaction itself.** Once the tx has the required confirmations, the NIM is already in the
  merchant's wallet. There is nothing to "capture", "settle" or "pay out" afterward, and no webhook.
- The backend **never holds funds or private keys**. It only needs the merchant's *public* receiving address and read access
  to a node.
- The backend **never sends transactions**. It only reads the chain to confirm a payment happened.
- **Reconciliation key:** every payment request has a unique `reference` (e.g. `PAW-7F3K9Q2M8XJ4`). The user's wallet attaches
  it as the transaction's *message* (`recipientData`). That is how a public, anonymous on-chain payment is tied back to a
  specific user and request.
- **Finality:** a payment only counts after `NIMIQ_MIN_CONFIRMATIONS` (default `2`) blocks.
- **Not implemented:** refunds, receipts/invoices, tax handling, fiat conversion. Price is fixed in NIM, so its fiat value
  moves with the market. Moving funds out of the receiving wallet is done manually by the merchant in their own wallet.

---

## 3. SDKs and libraries used

| Where | Package | Purpose |
|---|---|---|
| Frontend (web build, inside Nimiq Pay) | `@nimiq/mini-app-sdk` ^0.2.5 | `init()`, `sendBasicTransactionWithData()` (pay), `sign()` (sign in), `NimiqProviderError` |
| Backend | `@noble/hashes` (BLAKE2b) | Derive a Nimiq address from a public key (sign-in only) |
| Backend | Node `crypto` (built-in) | Ed25519 signature verification, SHA-256, random references/nonces |
| Backend | Node `fetch` (built-in) | JSON-RPC calls to the Nimiq node (10 s timeout) |
| Backend | `mongoose`, `zod`, `express-rate-limit` | Storage, request validation, rate limiting |
| Frontend | `expo-clipboard`, `expo-router`, `@tanstack/react-query` | Manual-pay copy buttons, navigation, membership state |

Nimiq docs referenced in code: <https://nimiq.com/developers/mini-apps> (provider API), <https://nimiq.com/developers/rpc> (running a node).

**Important:** there is no server-side Nimiq SDK. All chain reads are two JSON-RPC methods:
`getTransactionByHash` and `getTransactionsByAddress`.

---

## 4. End-to-end payment flow

```
App                              Backend                                Nimiq Pay / Node
 │ GET /v1/membership               │                                           │
 │─────────────────────────────────►│ entitlements + price + nimiq.enabled      │
 │ POST /v1/membership/nimiq/intents│                                           │
 │─────────────────────────────────►│ create/reuse PaymentIntent (pending)      │
 │◄─ { intent: id, recipient,       │                                           │
 │     amountLuna, reference, uri } │                                           │
 │                                                                              │
 │ nimiq.sendBasicTransactionWithData({recipient, value, data: reference}) ────►│ user approves in native dialog
 │◄─ txHash (only proves "submitted", NOT paid) ────────────────────────────────│
 │                                                                              │
 │ POST .../intents/:id/verify {txHash?}                                        │
 │─────────────────────────────────►│ getTransactionByHash / by reference ─────►│ Node
 │                                  │◄─ tx { to, value, recipientData,          │
 │                                  │        executionResult, confirmations }   │
 │                                  │ verifyTransaction(tx, intent)             │
 │◄─ {status:'pending', reason, confirmations, needed}   (repeat every 4 s)     │
 │◄─ {status:'paid', membership}                                                │
 │                                  │ claim intent atomically → grantMembership │
```

1. **Create intent** (`POST /v1/membership/nimiq/intents`). Server stores a `PaymentIntent` with the *current* price, the
   normalised receiving address, network, a fresh `reference`, and `expiresAt` (default 60 min). If the user already has a
   fresh pending intent with the same price/recipient/network it is **reused** (HTTP 200) instead of creating a new one (201).
2. **Pay.**
   - *Inside Nimiq Pay (one tap):* `sendBasicTransactionWithData({ recipient, value: amountLuna, data: reference })`.
   - *Outside Nimiq Pay (manual):* the unlock screen shows address, amount and reference with copy buttons, plus a
     `nimiq:<address>?amount=<NIM>&message=<reference>` deep link (`paymentUri`) and an "I've paid" button.
3. **Verify** (`POST /v1/membership/nimiq/intents/:intentId/verify`, body `{ txHash? }`). Server fetches the transaction from
   the node — by `txHash` if supplied, otherwise by scanning the last 100 incoming txs to the merchant address for a matching
   reference — and runs `verifyTransaction`.
4. **Poll.** The app calls verify every `4 s` up to `45` times (~3 min) while the status is `pending`.
5. **Claim & grant.** On success the intent is atomically flipped `pending → paid`, then the membership is granted.

### API contract

| Method & path | Auth | Rate limit | Purpose |
|---|---|---|---|
| `GET /v1/membership` | user | api | Entitlements, `price`, `nimiq: {enabled, network, recipient, minConfirmations}` |
| `POST /v1/membership/nimiq/intents` | user | 30 / min | Create or reuse a payment request |
| `POST /v1/membership/nimiq/intents/:intentId/verify` | user | 30 / min | Check chain, unlock if valid |

Verify response shapes:
- `200 { status: 'paid', membership }` — done (also returned if already paid; idempotent)
- `200 { status: 'pending', reason: 'not_found' | 'awaiting_confirmations', confirmations, needed }` — keep polling
- `400 payment_invalid` with `details.reason` ∈ `transaction_failed | wrong_recipient | amount_too_low | wrong_reference`
- `409 payment_already_used` — that tx already funded another intent
- `409 already_member` (on create) — user already has lifetime access
- `502 payment_provider_unavailable` — node unreachable (never treated as "paid")
- `503 payments_unavailable` — receiving address / RPC URL not configured
- `402 membership_required` — returned by any gated community endpoint when the user hasn't paid

---

## 5. Verification rules (the only gate to paid access)

`verifyTransaction(tx, intent)` in [backend/src/services/nimiqService.js](backend/src/services/nimiqService.js). A payment is accepted only if **all** hold:

1. Transaction exists on the node (else `pending: not_found` — it may simply not be mined yet).
2. `executionResult !== false` (the tx didn't fail).
3. `tx.to` equals the intent's recipient (after normalising spaces/case).
4. `tx.value >= intent.amountLuna` (overpaying is accepted; the amount recorded is what was actually paid).
5. Decoded `recipientData` (hex → UTF-8, trailing NULs trimmed) **equals** `intent.reference` exactly.
6. `confirmations >= NIMIQ_MIN_CONFIRMATIONS` (else `pending: awaiting_confirmations`).

Fraud / replay protections:
- **One tx → one intent:** a *partial unique index* on `PaymentIntent.txHash` (only where it's a string). A replayed tx hits
  Mongo error `11000` → `409 payment_already_used`.
- **Intent ownership:** verify looks up `{ _id, userId: req.userId }`, so one user can't claim another's payment request.
- **Atomic claim:** `findOneAndUpdate({_id, status:'pending'}, {status:'paid', ...})` — concurrent verify calls result in only one
  grant.
- **Price lock:** an intent stores `amountLuna` at creation, so changing `MEMBERSHIP_PRICE_NIM` never strands someone
  mid-payment.
- **Late payments honoured:** `expiresAt` only controls intent *reuse*; a payment arriving after expiry still verifies.
- **Node outage ≠ unlock:** RPC failures throw 502; they never fall through to "paid".
- **Receiving address checksum:** `isValidAddress` validates the IBAN-style mod-97 checksum at start-up; a typo disables payments
  (`paymentsStatus()` logs `Nimiq payments: OFF — <reason>`) instead of sending money to a wrong address.
- **Client hash is untrusted:** the hash from `sendBasicTransactionWithData` only means "submitted"; the server re-reads the chain.

---

## 6. Data model

**`PaymentIntent`** — [backend/src/models/PaymentIntent.js](backend/src/models/PaymentIntent.js)

| Field | Notes |
|---|---|
| `userId` | → User; set to `null` on account deletion (record kept, detached from person) |
| `provider` | `'nimiq'` |
| `network` | `'mainnet'` \| `'testnet'` |
| `recipient` | normalised address we expect to be paid (`NQ07 0000 ...` – upper-case, groups of 4) |
| `amountLuna` | integer ≥ 1, price at creation time |
| `reference` | unique, `PAW-` + 12 chars from `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (no 0/O/1/I); 16 bytes (limit is 64) |
| `status` | `pending` \| `paid` |
| `txHash`, `paidLuna`, `paidAt` | set at claim time |
| `expiresAt` | reuse window (`PAYMENT_INTENT_TTL_MIN`, default 60) |

**`Membership`** — [backend/src/models/Membership.js](backend/src/models/Membership.js): one row per user (`userId` unique).
`plan: 'club'`, `status: active|revoked`, `source: nimiq|admin`, `expiresAt` (`null` = lifetime), `lastTxHash`, `totalPaidLuna`.

Entitlement logic — [backend/src/services/entitlementService.js](backend/src/services/entitlementService.js):
- `entitlementsFor(user)` → `{ plan, membership, features: { petCare: true, basicFitness: true, community } }`.
  `community` is true if `!ENFORCE_MEMBERSHIP`, or an active non-expired membership exists, or `role === 'admin'`.
- `requireFeature('community')` middleware → `402 membership_required`.
- `grantMembership(userId, {source, txHash, paidLuna, days})` — lifetime if `days<=0`; otherwise extends from the later of
  *now* / current expiry. Already-lifetime members only get the extra payment recorded.
- Invariant: **pet-care records and reminders are never gated**, even for lapsed members.

---

## 7. Configuration (env vars)

Defined in [backend/src/config/env.js](backend/src/config/env.js); templates in `backend/.env.example` and `render.yaml`.

| Variable | Default | Meaning |
|---|---|---|
| `NIMIQ_RECEIVE_ADDRESS` | *(empty = payments off)* | **Merchant wallet** that receives NIM. Checksum-validated at boot |
| `NIMIQ_RPC_URL` | *(empty = payments off)* | Nimiq node JSON-RPC endpoint |
| `NIMIQ_NETWORK` | `mainnet` | `mainnet` or `testnet`. Must match the node *and* the user's Nimiq Pay network |
| `NIMIQ_MIN_CONFIRMATIONS` | `2` | Blocks needed before unlock |
| `MEMBERSHIP_PRICE_NIM` | `1` | Price in NIM; up to 5 decimals; invalid value stops the server booting |
| `MEMBERSHIP_DAYS` | `0` | `0` = one-time lifetime; N = N days of access |
| `ENFORCE_MEMBERSHIP` | `1` | `0` opens community to everyone (dev/trial only) |
| `PAYMENT_INTENT_TTL_MIN` | `60` | Intent reuse window |
| `CORS_ORIGINS` | – | Must include the web origin that is loaded inside Nimiq Pay |
| `ENABLE_PASSWORD_AUTH` | off | Dev/test only; production uses wallet sign-in |

**Node choice:** for a trial, `https://rpc.nimiqwatch.com` (mainnet only, public, no uptime guarantee, may log requests).
For production **run your own node** (<https://nimiq.com/developers/rpc>) — a node you don't control could in theory report a
payment that didn't happen. The node is the trust root of the whole scheme.

Start-up logs show the state, e.g. `Nimiq payments: ON -> NQ.. (mainnet)` or `Nimiq payments: OFF — <reason>`.

---

## 8. Sign-in with Nimiq Pay (tied to payments — account = wallet)

[backend/src/services/nimiqAuthService.js](backend/src/services/nimiqAuthService.js), `signInWithNimiq` in
[backend/src/services/authService.js](backend/src/services/authService.js).

1. `POST /v1/auth/nimiq/challenge` → server issues a one-time message (random 16-byte nonce, domain, timestamp), valid 5 min.
2. App calls `nimiq.sign(message)` → `{ publicKey, signature }` (hex; 32-byte key, 64-byte Ed25519 sig).
3. `POST /v1/auth/nimiq/sign-in` → challenge is **consumed first** (atomic `findOneAndDelete`), signature verified, wallet
   address **derived from the public key** (first 20 bytes of BLAKE2b-256, base32, IBAN check digits).
4. The derived address *is* the account (`User.nimiq.address`, unique among live accounts). The server never trusts an address
   sent by the client, nor `listAccounts()` (Nimiq docs: it doesn't prove ownership).

Known uncertainty: Nimiq's docs don't state Nimiq Pay's signed-message byte format, so the server accepts the documented
Hub/Keyguard scheme (`"\x16Nimiq Signed Message:\n" + len + msg`, SHA-256) plus three plain variants (raw, sha256, prefixed).
Safe because each message contains a fresh single-use nonce. The first successful sign-in logs which format Nimiq Pay uses
(`[nimiq-auth] new account; signature verified as "<format>"`) — **check this once on the real app** and, if you want, narrow it.

---

## 9. Frontend structure

| File | Role |
|---|---|
| [frontend/src/payments/nimiqPay.web.js](frontend/src/payments/nimiqPay.web.js) | Web build (runs inside Nimiq Pay). `isInsideNimiqPay()` (checks `window.nimiq`/`window.nimiqPay`), `hostNetwork()`, `payWithNimiqPay()`, `signWithNimiqPay()`, `openInNimiqPayUrl()` |
| [frontend/src/payments/nimiqPay.js](frontend/src/payments/nimiqPay.js) | Native stub: pay/sign throw; `openInNimiqPayUrl()` → `https://nimpay.app/miniapps/open/<host>` |
| [frontend/src/app/unlock.js](frontend/src/app/unlock.js) | Unlock screen: create intent, pay (one-tap or manual), poll verify, success state |
| [frontend/src/components/Paywall.js](frontend/src/components/Paywall.js) | `CommunityPaywall` card + `RequireCommunity` route guard (redirects to `/unlock` when locked) |
| [frontend/src/hooks/useMembership.js](frontend/src/hooks/useMembership.js) | React-Query hook for `GET /v1/membership`; `useCommunityAccess()` → `{loading, locked}` |
| [frontend/src/api/resources.js](frontend/src/api/resources.js) | `MembershipApi.get / createIntent / verify` |

SDK usage detail (web build):
```js
import { init, NimiqProviderError } from '@nimiq/mini-app-sdk';
const nimiq = await init({ timeout: 8000 });
const txHash = await nimiq.sendBasicTransactionWithData({ recipient, value: amountLuna, data: reference });
const { publicKey, signature } = await nimiq.sign(message);
// User cancelled:  NimiqProviderError.is(e) && e.type === 'PERMISSION_DENIED'
// Rejected tx:     e.type === 'INVALID_TRANSACTION'
```
Before paying, the app checks `window.nimiqPay.network` equals the intent's `network` and shows a "wrong network" error otherwise.

How a user reaches the paywall: gated endpoints return `402 membership_required` → the app routes to `/unlock`.

---

## 10. Operating it

- **Go live checklist** (from [DEPLOY.md](DEPLOY.md)): `ENFORCE_MEMBERSHIP=1`; `NIMIQ_RECEIVE_ADDRESS` set; `NIMIQ_RPC_URL` set;
  `ENABLE_PASSWORD_AUTH=0`; HTTPS domain added to `CORS_ORIGINS`; tested a full payment on **testnet**, then a small one on mainnet;
  own Nimiq node (or accept public-node risk).
- **Testnet:** set `NIMIQ_NETWORK=testnet` + a testnet node URL; in Nimiq Pay long-press the settings button ~10 s to open the hidden dev menu and switch network.
- **Open as a mini app:** Nimiq Pay → Mini Apps → Custom URL, or `nimiqpay://miniapp?url=<your-https-domain>`.
- **Comp access without payment:** `cd backend && npm run grant-membership -- "NQ.. wallet address" [days]` (source `admin`).
- **Troubleshooting a payment that didn't unlock:** it must go to the configured address, be ≥ price, carry the exact reference as its
  message, and reach the confirmation count. Check server logs and a Nimiq block explorer. `payment_invalid.details.reason` tells which rule failed.
- **Account deletion:** membership row is deleted; `PaymentIntent.userId` set to `null` (financial record retained, detached from the person).
- **Audit log:** `payment.intent` and `payment.confirmed` (with txHash and Luna) are recorded.

---

## 11. Known limitations / things the next implementer must know

1. **Never tested against real money.** The README states this explicitly: verified with a fake node (`setNimiqRpc`) and
   real API response shapes read live, but no real NIM payment and no real Nimiq Pay session. Do a testnet run first.
2. **Trust in the node.** Whoever controls `NIMIQ_RPC_URL` controls what the server believes. Use your own node in production.
3. **Store policy.** Apple/Google may reject selling digital content for crypto inside store apps. The Nimiq Pay mini-app
   route (web view) isn't subject to that; native builds only show manual-pay instructions.
4. **No refunds, receipts, tax, or fiat pricing.** No webhook/push from the chain — confirmation is poll-based (client polls verify).
5. **Search window for hash-less verify:** `getTransactionsByAddress(address, 100)` only looks at the latest 100 txs to the
   merchant address. On a very busy address, a hash-less verify could miss an older payment; passing `txHash` always works.
   (Inside Nimiq Pay the hash is always available.)
6. **Overpayment** is accepted and recorded in `paidLuna`/`totalPaidLuna`, not refunded. Multiple payments by a lifetime member just
   add to `totalPaidLuna`.
7. **`sign()` byte format** is not documented by Nimiq Pay (see §8).
8. **Native builds can't sign in or pay in one tap**, only deep-link to Nimiq Pay.

---

## 12. Tests to read / reuse

[backend/tests/membership.test.js](backend/tests/membership.test.js) — address checksum, price parsing, price-change mid-payment,
paywall locks community but not pet care, fake-node happy path, verification without hash (by reference), wrong
recipient/short/wrong-message/failed tx, replay and cross-user claims, concurrent verify, node outage = 502, timed expiry,
admin bypass, account deletion. [backend/tests/nimiq-auth.test.js](backend/tests/nimiq-auth.test.js) — wallet sign-in
(address derivation, forged keys, tampered/replayed challenges). Tests inject a fake node via `setNimiqRpc(fn)` — copy this seam
to keep payment logic testable without a network.

---

## 13. Porting checklist for the new codebase

1. Add `@nimiq/mini-app-sdk` to the web frontend; copy the `nimiqPay.web.js` wrapper (and a native stub).
2. Copy `nimiqService.js` (units, address validation, reference generator, JSON-RPC client with test seam, `verifyTransaction`).
3. Add `PaymentIntent` (with the **partial unique index on `txHash`** and unique `reference`) and an entitlement record.
4. Add the 3 endpoints (§4) with rate limiting, and `requireFeature` middleware returning `402` on gated routes.
5. Make the entitlement server-owned: the client only reads it from `GET /v1/membership`.
6. Env: `NIMIQ_RECEIVE_ADDRESS`, `NIMIQ_RPC_URL`, `NIMIQ_NETWORK`, `NIMIQ_MIN_CONFIRMATIONS`, price/duration; validate at boot and log ON/OFF.
7. Build the unlock screen: create intent → pay → poll verify (4 s × 45) → success; with the manual-pay fallback.
8. Run the verification test matrix against a fake node, then testnet, then a small mainnet payment.
