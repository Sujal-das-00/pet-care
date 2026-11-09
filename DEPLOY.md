# Deploying PawCircle on Render

One Render service hosts everything: the **API**, the **web app** and **live chat**, all on a single HTTPS address
(no CORS to configure). The database is **MongoDB Atlas** (Render doesn't host MongoDB).

```
 phone / browser / Nimiq Pay ──https──►  Render web service "pawcircle"
                                          ├─ serves the web app   (frontend/dist, built beforehand)
                                          ├─ /v1/...              REST API
                                          ├─ /v1/chat/ws          live chat (WebSocket)
                                          └─ reminder scheduler   (runs inside the same process)
                                                   │
                                                   ▼
                                            MongoDB Atlas
```

**You will need:** a GitHub account, a Render account, a MongoDB Atlas account, Node 22 on your computer, and (for
payments) a Nimiq wallet address.

---

## Step 1 — MongoDB Atlas (database)

1. Create a free account at <https://www.mongodb.com/cloud/atlas> and create a cluster (the free **M0** tier is fine to start).
   Pick a region near your Render region (Tokyo/Singapore).
2. **Database Access → Add New Database User.** Choose a username and a long generated password. Give it
   *Read and write to any database* (or restrict it to the `pawcircle` database).
3. **Network Access → Add IP Address → Allow access from anywhere (`0.0.0.0/0`).** Render's free and starter instances
   don't have a fixed outbound IP, so the allow-list must be open; the username and password protect the database.
4. **Connect → Drivers** and copy the connection string. Put your password in it and add the database name before the `?`:

   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/pawcircle?retryWrites=true&w=majority
   ```

   If the password contains special characters (`@ : / ? #`), URL-encode them.

> Atlas **M0 has no automatic backups.** Before real users arrive, move to a paid cluster tier with backups, or schedule
> your own `mongodump`.

## Step 2 — Build the web app and commit it

The server serves the built web app from `frontend/dist`. Build it on your computer (a cold build needs about 1 GB of RAM
and takes about a minute, which is more than Render's 512 MB instances have):

```bash
npm run build:web        # from the repo root; uses Node 22
```

(That command is for macOS, Linux or Windows Git Bash/WSL. It builds with an empty `EXPO_PUBLIC_API_URL` and demo content off, so
the result is the same on every machine, whatever is in your local `frontend/.env`.)

`frontend/dist` is deliberately **not** git-ignored. Commit it together with your code:

```bash
git add -A && git commit -m "Build web app"
```

The build works on any domain: when it's served by the API, the app talks to the address it was loaded from.
You only need to rebuild and recommit `frontend/dist` when you change the **frontend**; backend-only changes don't need it.

> *Why so much memory?* The app itself is small (about 2 MB of JavaScript), but Expo's bundler starts one worker process per CPU
> core, each with its own copy of the compiler, to transform thousands of library files. I measured a cold build at roughly
> 950 MB with 4 workers and roughly 490 MB with `--max-workers 1` (about 20 seconds slower). That is still too close to a
> 512 MB instance to trust, which is why the guide builds on your own computer.

> *Prefer building on Render?* Replace the `buildCommand` in `render.yaml` with
> `npm run build:web && cd backend && npm ci --omit=dev` and use an instance with **at least 2 GB of RAM**.
> It works, but costs more and deploys slower.

## Step 3 — Push to GitHub

Create a repository (private is fine) and push this project to it. Don't commit any `.env` file; they are git-ignored
and the secrets belong in Render.

## Step 4 — Create the service on Render

1. Render dashboard → **New → Blueprint** → connect your GitHub repo. Render reads `render.yaml` at the repo root.
2. It will ask for the values marked *secret*:

   | Variable | What to enter |
   |---|---|
   | `MONGODB_URI` | The Atlas connection string from Step 1 |
   | `NIMIQ_RECEIVE_ADDRESS` | **Your** Nimiq wallet address (where payments go). Leave empty to run with payments off |
   | `NIMIQ_RPC_URL` | A Nimiq node's JSON-RPC URL (see *Nimiq payments* below). Leave empty with payments off |

   `JWT_ACCESS_SECRET` is generated for you.
3. Choose your instance size when prompted (the Blueprint defaults to **Starter** in **Singapore**, the closest region to
   Japan). Keep it at **one instance**: live chat keeps its rooms in that process's memory.
4. Create. Render installs, starts, and checks `/health`. Open the `https://<name>.onrender.com` address it gives you.

In the **Logs** you should see, in this order:

```
Membership: community costs 1 NIM (one-time, lifetime access)
Nimiq payments: ON -> NQ..  (mainnet)        <- or "OFF — <the reason>"
Reminders: running inside the API process
Web app: serving …/frontend/dist
PawCircle API listening on :10000
```

If it says `Web app: not found`, `frontend/dist` wasn't committed (Step 2).

## Step 5 — Make yourself the admin

People sign in with their **Nimiq Pay wallet**; there are no emails or passwords. Only admins can post weekly challenges and
review reports, so:

1. Open your site **inside Nimiq Pay** (Mini Apps → Custom URL, or `nimiqpay://miniapp?url=<your-domain>`) and sign in once.
   That creates your account from your wallet.
2. In the app go to **Settings**. Your wallet address (`NQ..`) is shown under your name. Copy it.
3. From your computer, promote it in the same database:

```bash
cd backend
npm install
MONGODB_URI="<your Atlas connection string>" npm run make-admin -- "NQ12 3456 7890 ..."
```

Close and reopen the app. **Settings → Admin → Manage weekly challenges** now appears. To give a wallet community access
without a payment (staff, support, testing): `MONGODB_URI=... npm run grant-membership -- "NQ.. ...."`.

> Anyone who tries to sign in must hold the wallet: the server verifies a signature from it, so nobody can take over your
> admin account by knowing your address. Email + password sign-in is switched off in production (`ENABLE_PASSWORD_AUTH=0`).

---

## Settings you can change later

Change these in Render → your service → **Environment**, then it redeploys automatically.

| Variable | Meaning |
|---|---|
| `MEMBERSHIP_PRICE_NIM` | Price of community access, in NIM (`1`, `2.5`, `0.5`; up to 5 decimals). Someone mid-payment keeps the price they were shown |
| `MEMBERSHIP_DAYS` | `0` = one-time payment, never expires. Any other number = access lasts that many days |
| `ENFORCE_MEMBERSHIP` | `1` = community is paid. `0` = open to everyone (for trials only) |
| `NIMIQ_NETWORK` | `mainnet` or `testnet`. Must match the node in `NIMIQ_RPC_URL` |
| `NIMIQ_MIN_CONFIRMATIONS` | Blocks a payment needs before it unlocks access (default 2) |
| `TRUST_PROXY_HOPS` | Proxies in front of the app. If every visitor seems to share one rate limit (everyone gets "too many requests"), raise it to `2` |
| `ENABLE_PASSWORD_AUTH` | Keep `0`. Email + password sign-in is for local development only |
| `RUN_WORKER_IN_PROCESS` | `1` runs reminders inside the web service. Leave it on |

## Nimiq payments

- **Receiving address:** the wallet address that should receive members' NIM. The server checks its checksum at start-up and
  reports `Nimiq payments: OFF — …` in the logs if it's mistyped.
- **Node (`NIMIQ_RPC_URL`):** the server asks a Nimiq node whether a payment really happened. For a quick trial you can use
  the free public server `https://rpc.nimiqwatch.com` (mainnet only). Nimiq's docs say public servers have no uptime guarantee,
  may throttle and may log requests, and a node you don't control could in theory report a payment that didn't happen, so for
  a real launch **run your own node** (guide: <https://nimiq.com/developers/rpc>).
- **Try testnet first.** Set `NIMIQ_NETWORK=testnet`, point `NIMIQ_RPC_URL` at a testnet node, and in Nimiq Pay open the
  hidden dev menu (long-press the settings button for 10 seconds) to switch networks. Make a test payment end to end before
  switching to `mainnet`.
- **One-tap payments inside Nimiq Pay:** in Nimiq Pay go to **Mini Apps → Custom URL** and enter your Render address, or share
  `nimiqpay://miniapp?url=<your-domain>` (it must be HTTPS, which Render provides). Outside Nimiq Pay the unlock screen shows
  the address, amount and message to pay from any Nimiq wallet.

## Sign-in (Nimiq Pay)

PawCircle is a Nimiq Pay **mini app**: the app asks Nimiq Pay to sign a one-time message (`nimiq.sign`), and the server checks
the signature and derives the wallet address from the public key. That address *is* the account. Opened in a normal browser or
phone browser, the app shows an **Open in Nimiq Pay** button instead of a sign-in form.

- **Nimiq Pay is required to sign in**, so you can only test sign-in inside Nimiq Pay. Nimiq's tutorial mentions mini-app
  testing may be limited to allow-listed users; check their tutorial or the competition dashboard if the Custom URL doesn't load.
- On the first sign-in the server logs `[nimiq-auth] new account; signature verified as "<format>"`. If **every** sign-in fails
  with "We couldn't verify your wallet signature", look for `[nimiq-auth] signature did not verify` in the logs: it means Nimiq
  Pay signs in a format the server doesn't accept yet (the docs don't specify it), and the fix is a small server change.

## Custom domain

Render → your service → **Settings → Custom Domains**, add the domain and create the DNS record Render shows. HTTPS is
automatic. Nothing in the app needs changing. If you use Nimiq Pay's Custom URL, update it to the new domain.

## Updating the app

- **Backend change:** push to GitHub; Render redeploys automatically.
- **Frontend change:** `npm run build:web`, commit the updated `frontend/dist`, push.
- **Rollback:** Render → **Events/Deploys → Rollback** to a previous deploy.

## Free vs paid instances

| | Free | Starter and up |
|---|---|---|
| Sleeps when idle | Yes (~15 min); the first visit after that is slow | No |
| Reminders | Only run while the service is awake, so **they can be missed** | Run continuously |
| Good for | A demo for a few people | A real launch |

Check Render's pricing page for current prices.

## What's not set up yet

- **Push notifications** need a native app build with an Expo (EAS) project ID. On the web version, reminders appear in the
  in-app notifications list only.
- **Health-document uploads** stay off until you configure Cloudflare R2 (`R2_ENDPOINT`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`).
- **Running several instances** needs a shared message layer (Redis) for live chat first.
- **Account recovery:** an account *is* a wallet, so losing access to the wallet means losing the account. There's no "forgot
  password", and nothing links a wallet to an email. Tell members to back up their Nimiq wallet's recovery phrase.
- **Terms of Service and Privacy Policy pages** are referenced in the sign-up consent but the documents themselves aren't
  written; you need these before opening to the public (and for the App Store / Google Play).
- **Monitoring and alerts:** use Render's built-in logs/metrics and Atlas alerts to start.

## If you created the service by hand (not with the Blueprint)

The Blueprint sets everything for you. If you created the service manually (**New → Web Service**), set these in the service's
**Settings** and **Environment**:

| Setting | Value |
|---|---|
| Build Command | `yarn install` (Render's default works: the repo root installs the backend's packages for you) |
| Start Command | `yarn start` (Render's default), or `cd backend && node scripts/seed.js && node src/server.js` to also add the starter content |
| Health Check Path | `/health` |
| Environment variables | `NODE_ENV=production`, `MONGODB_URI`, `JWT_ACCESS_SECRET` (a random string of 32+ characters), `RUN_WORKER_IN_PROCESS=1`, `ENABLE_PASSWORD_AUTH=0`, and the `NIMIQ_*` and `MEMBERSHIP_*` values from the table below |

Node 22 is pinned for you (`.node-version` and `package.json`), so don't set a different version.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `Cannot find package 'dotenv'` (or any package) at start-up | The backend's packages weren't installed. Pull the latest code: the repo root now installs them during `yarn install`. If you changed the Build Command, set it back to `yarn install` |
| Logs say `Using Node.js version 26…` | Node isn't pinned. Make sure `.node-version` and the root `package.json` (`"engines": { "node": "22.x" }`) are committed |
| Deploy fails or the service restarts in a loop; logs show `connect ECONNREFUSED`/`ServerSelectionError` | Atlas isn't reachable: check **Network Access** allows `0.0.0.0/0`, and that `MONGODB_URI` has the right password and a database name |
| Logs: `MEMBERSHIP_PRICE_NIM must be a positive number…` | The price isn't a plain number such as `1` or `2.5` |
| `Missing env var JWT_ACCESS_SECRET` or "must be >= 32 chars" | The secret is missing or too short. Let Render generate it |
| Blank page, or `Web app: not found` in the logs | `frontend/dist` wasn't committed. Run `npm run build:web` and commit it |
| "PawCircle runs inside Nimiq Pay" instead of a sign-in button | You opened the site in a normal browser. Open it from Nimiq Pay (Mini Apps → Custom URL) |
| "Nimiq Pay didn't respond" | The app couldn't find Nimiq Pay's wallet. Open it from inside Nimiq Pay, not another in-app browser |
| Page loads but sign-in says it can't reach the server | Open the browser console; the app should be calling its own address. Make sure you rebuilt after pulling the latest code |
| Everyone gets "Too many requests" | All visitors look like one IP. Set `TRUST_PROXY_HOPS=2` |
| Community says "Payments aren't available yet" | Check the start-up line `Nimiq payments: OFF — <reason>` in the logs |
| A payment doesn't unlock access | The payment must go to your address, be at least the price, carry the message shown, and reach the confirmation count. Check the Render logs and a Nimiq block explorer |
| Chat stuck on "Connecting…" | It falls back to polling every few seconds, so messages still arrive. If it never goes live, a proxy may be blocking WebSockets; ask Render support or try another browser |

## Security checklist before you open it up

- [ ] `ENFORCE_MEMBERSHIP=1`
- [ ] Atlas user has a strong password and only the access it needs; backups are on (paid tier)
- [ ] `JWT_ACCESS_SECRET` is the generated one and isn't stored anywhere public
- [ ] You tested a full payment on **testnet**, then once on mainnet with a small amount
- [ ] You run your own Nimiq node (or accept the risks of a public one)
- [ ] `ENABLE_PASSWORD_AUTH` is `0` in production, and your admin wallet's recovery phrase is backed up
- [ ] Terms of Service and Privacy Policy are published
