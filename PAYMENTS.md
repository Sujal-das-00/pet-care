# PawCircle Payments — Implementation Reference

Handover document for anyone implementing payments in another codebase using this one as the reference.
Everything below is taken from the code in this repo; file paths are given so you can read the source alongside.

**Reading guide**
- New here? Read **Part A** (plain-words walkthrough) and **Part B** (stuck approval? start here).
- Implementing it? Read **Part C** (technical reference, §1–§13).

---

# Part A — The whole flow in plain words (sign-in → settlement)

## The big idea in 5 lines

1. There is **no payment company** (no Stripe/PayPal). The user pays in **NIM** (Nimiq crypto) straight from their wallet app, **Nimiq Pay**, to our wallet.
2. The user's **wallet is their account**. Signing in = proving "I own this wallet" by signing a message.
3. Before paying, our server makes a **payment request** with a unique code (the *reference*, like `PAW-7F3K9Q2M8XJ4`).
4. The wallet sends the NIM and writes that code into the transaction's **message**. That code is how we know *who* paid.
5. The app never gets to say "I paid". The **server looks at the blockchain itself** and only unlocks if everything matches.

## Who is involved

| Actor | Job |
|---|---|
| **User** | Taps "Pay", approves in the wallet |
| **Our app** (web build, opened *inside* Nimiq Pay) | Shows the price, asks the wallet to sign / pay, then asks our server "am I paid yet?" |
| **Nimiq Pay** (wallet) | Holds the keys. Shows the native "Approve?" dialog. Sends the transaction |
| **Our backend** | Creates payment requests, checks the blockchain, unlocks access. Holds **no keys, no money** |
| **Nimiq node** (`NIMIQ_RPC_URL`) | Our window into the blockchain (read-only) |
| **Merchant wallet** (`NIMIQ_RECEIVE_ADDRESS`) | Where the NIM lands. This is the settlement |

## Step by step

### Phase 1 — Sign in (collecting the user's NIM wallet)

| # | What happens | Where |
|---|---|---|
| 1 | User opens PawCircle inside Nimiq Pay (Mini Apps → our URL). Nimiq Pay injects `window.nimiq` into the page. | `isInsideNimiqPay()` |
| 2 | App asks the server for a challenge: `POST /v1/auth/nimiq/challenge`. Server returns a one-time message (random nonce + domain + time), valid **5 min**. | `nimiqAuthService.js` |
| 3 | App calls `nimiq.sign(message)`. Nimiq Pay shows an **approve** dialog. **No money moves.** | `signWithNimiqPay()` |
| 4 | Wallet returns `{ publicKey, signature }`. | |
| 5 | App sends them to `POST /v1/auth/nimiq/sign-in`. | |
| 6 | Server **burns the challenge first** (so it can't be replayed), checks the signature, then **computes the wallet address from the public key** (it never trusts an address the client sends). | |
| 7 | That address **is** the account (`User.nimiq.address`). User is logged in. | |

So by the end of sign-in we know the user's NIM wallet address, cryptographically.

### Phase 2 — Paywall and payment request

| # | What happens |
|---|---|
| 8 | User taps a Community feature. Server answers `402 membership_required`; app routes to `/unlock`. |
| 9 | App calls `GET /v1/membership` → gets price, network (`mainnet`/`testnet`), merchant address, and whether payments are on. |
| 10 | App calls `POST /v1/membership/nimiq/intents`. Server saves a **PaymentIntent** (`pending`): amount in Luna (1 NIM = 100,000 Luna), merchant address, network, unique **reference**, expiry. If a fresh one already exists it is **reused**. |

### Phase 3 — Pay (user approval)

| # | What happens |
|---|---|
| 11 | App checks the user's wallet network equals the intent's network. Mismatch → "wrong network" error, stop. |
| 12 | App calls `nimiq.sendBasicTransactionWithData({ recipient, value: amountLuna, data: reference })`. |
| 13 | **Nimiq Pay shows the approve dialog** (amount, recipient). User approves (or cancels → nothing happens). |
| 14 | Wallet signs and broadcasts the transaction to the Nimiq network and returns a **txHash**. This only means *"submitted"*, **not "paid"**. |

*Outside Nimiq Pay (fallback):* the screen shows address, amount and reference with copy buttons and a `nimiq:` deep link. The user pays manually and **must paste the reference into the message field**, then taps "I've paid".

### Phase 4 — Verification (how we know it's real)

| # | What happens |
|---|---|
| 15 | App calls `POST /v1/membership/nimiq/intents/:id/verify` with the `txHash`. Server only looks up intents owned by this user. |
| 16 | Server asks the **node** for that transaction (`getTransactionByHash`). No hash? It scans the last 100 incoming txs to the merchant address for our reference. |
| 17 | Server runs the checklist. **All** must pass: |
| | ① tx exists on chain · ② didn't fail · ③ sent **to our address** · ④ amount **≥ price** · ⑤ message **equals the reference exactly** · ⑥ has **≥ 2 confirmations** |
| 18 | Not mined / not enough confirmations → server replies `pending`. App **re-asks every 4 s, up to 45 times (~3 min)**. |
| 19 | Something wrong (wrong address/amount/message, failed tx) → `400 payment_invalid` with the exact `reason`. |
| 20 | Node unreachable → `502`. This is **never** treated as paid. |

### Phase 5 — Settlement and unlock

| # | What happens |
|---|---|
| 21 | Server atomically flips the intent `pending → paid` (only one concurrent request can win) and stores `txHash`. A **unique index on txHash** means one transaction can never pay twice. |
| 22 | Server grants the **Membership** (lifetime by default) and notifies the user. |
| 23 | App refreshes entitlements → Community unlocks. 🎉 |
| 24 | **Settlement:** the NIM is already in the merchant wallet from step 14. There is no capture, no payout, no webhook, no fee. Moving it onward is done by hand in the merchant's own wallet. |

### One picture

```
SIGN IN                         PAY                                  VERIFY & UNLOCK
user ─ sign(challenge) ─► server    server ─ intent{ref,amount} ─► app   app ─ verify(txHash) ─► server
server derives wallet addr          app ─ sendTx(amount, msg=ref) ─► Nimiq Pay      server ─ read tx ─► Node
account = wallet                    user approves ✔ ── tx on blockchain ──► merchant wallet   checks 6 rules ─► paid ─► unlock
```

---

# Part B — "Payment approval doesn't work in another app" — debugging guide

"Approval" can mean two different things. Work out which one is failing first.

| Symptom | Stage | Most likely cause | Fix |
|---|---|---|---|
| No approve dialog ever appears; `init()` times out (8 s) | **Before** approval | Page is **not running inside Nimiq Pay** (opened in Chrome/Safari). `window.nimiq` doesn't exist | Open it via Nimiq Pay → Mini Apps → Custom URL, or `nimiqpay://miniapp?url=<https-url>`. Must be **HTTPS** |
| Blank page / API calls blocked in Nimiq Pay | Before approval | Backend `CORS_ORIGINS` doesn't include the web origin | Add the exact origin (scheme + host, no trailing slash) |
| Dialog appears, user taps approve, app says "cancelled" | Approval | SDK threw `PERMISSION_DENIED` (user really declined, **or** wallet denied the app) | Retry; check Nimiq Pay isn't blocking the mini app; log `error.type` and `error.message` |
| Dialog shows error / app shows "invalid" | Approval | `INVALID_TRANSACTION`: bad `recipient` address, `value` not an integer **Luna** (not NIM!), or `data` too long (limit 64 bytes) | Log the exact args passed to `sendBasicTransactionWithData`. `value` = NIM × 100000 |
| "Wrong network" message | Before approval | Wallet on testnet, server on mainnet (or vice versa) | Align `NIMIQ_NETWORK`, the node URL and the wallet network |
| Approved, got a txHash, app stays "pending" forever | **After** approval | Server can't find/confirm it: node is on a different network, node is lagging, or confirmations < `NIMIQ_MIN_CONFIRMATIONS` | Look the hash up on a block explorer; query the same node; check `needed` vs `confirmations` in the verify response |
| `400 payment_invalid` → `wrong_reference` | After approval | Message isn't **exactly** the reference (manual payers forget it / add spaces; or the other app didn't pass `data: reference`) | Make sure `data` = `intent.reference` unchanged |
| `payment_invalid` → `wrong_recipient` | After approval | Paid to a different address than the intent's | Pay the `intent.recipient` returned by the server, don't hard-code |
| `payment_invalid` → `amount_too_low` | After approval | Sent less than `amountLuna` (often NIM/Luna mix-up) | Use `intent.amountLuna` as-is |
| `409 payment_already_used` | After approval | That txHash already paid a different intent | Create a new intent; a tx can only be used once |
| `502 payment_provider_unavailable` | After approval | Node unreachable (the app is **not** told "paid") | Check `NIMIQ_RPC_URL`, try again |
| `503 payments_unavailable` | Before | `NIMIQ_RECEIVE_ADDRESS` / `NIMIQ_RPC_URL` missing or address typo (checksum) | Check boot log: `Nimiq payments: OFF — <reason>` |
| Sign-in "invalid signature" | Sign-in approval | Nimiq Pay's signed-message byte format differs from what the server expects (undocumented, see §8) | Check the log `[nimiq-auth] ... verified as "<format>"`; port all four accepted variants |

### 5-minute diagnosis checklist

1. **Is it inside Nimiq Pay?** In the console: `!!(window.nimiq || window.nimiqPay)` must be `true`.
2. **Same network everywhere?** `window.nimiqPay.network` === server `NIMIQ_NETWORK` === node's network.
3. **Log what you pass to the SDK**: `{ recipient, value, data }`. `value` must be an integer in Luna; `data` must be the intent reference.
4. **Catch and print the error**: `NimiqProviderError.is(e)` → `e.type` (`PERMISSION_DENIED` = declined, `INVALID_TRANSACTION` = bad args).
5. **Did a txHash come back?** No → problem is *before the chain* (steps 1–4). Yes → the wallet part works; go to 6.
6. **Look up the txHash on a Nimiq block explorer.** Check *to*, *amount*, *message*, *confirmations*.
7. **Hit the verify endpoint and read the response**: `pending` + reason, or `payment_invalid` + `details.reason` names the exact rule that failed.
8. **Check the server log** for `payment.intent` / `payment.confirmed` and the `Nimiq payments: ON/OFF` boot line.

> Honest caveat: this repo has **never been run against the real Nimiq Pay app with real money** (see §11), so details such as
> the exact `sign()` byte format and the shape of `sendBasicTransactionWithData` errors on a live wallet are unconfirmed. When the other app fails, capture
> the **raw error object and the raw node transaction** (log `tx` in `verifyIntent`) — that will show quickly whether the
> problem is the wallet side (before a txHash) or the verification side (after).

---

# Part C — Technical reference

## 1. Summary

| Question | Answer |
|---|---|
| What is sold? | One feature: **Community** access (groups, posts, comments, events, event ideas, challenges). Pet care is always free. |
| Currency | **NIM** (Nimiq cryptocurrency). Smallest unit is **Luna**: `1 NIM = 100,000 Luna`. |
| Payment provider | **None.** There is no Stripe/PayPal/processor. The user pays directly on the Nimiq blockchain. |
| Wallet / client SDK | **Nimiq Pay** mini-app SDK: `@nimiq/mini-app-sdk` `^0.2.5` (frontend only). |
| Server-side "SDK" | **None.** The backend talks to a Nimiq node over plain **JSON-RPC** using `fetch`. |
| Settlement | The user's NIM goes **wallet → wallet, on-chain**, straight to the merchant's receiving address (`NIMIQ_RECEIVE_ADDRESS`). No custody, no payout step, no fees paid to a processor. |
| Price | `MEMBERSHIP_PRICE_NIM` (default `1`), monthly by default (`MEMBERSHIP_DAYS=30`; `0` = lifetime). |
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
