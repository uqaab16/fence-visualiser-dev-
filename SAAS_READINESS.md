# SAAS-READINESS tracker

Label: **SAAS-READINESS**. Every item from the SaaS-readiness audit and cost breakdown lives here.
When the owner mentions "SAAS-READINESS", read this file first, before relying on conversation memory.

Last updated: 2026-09-30

## How to use

- Status values: `not started` / `in progress` / `done`.
- Phases used in THIS file:
  - **Phase 1: safe to onboard real customers** (security holes, data safety, legal floor, environments)
  - **Phase 2: safe to charge** (billing, data rights, integrity, paid-plan prerequisites)
  - **Phase 3: built to grow** (teams, ops tooling, analytics, cleanup)
- **WARNING, different numbering from the master business plan.** The owner's master plan (`fence-visualiser-master-plan` HTML) has its own Phases 0-3 (Phase 0 Foundations, Phase 1 SaaS MVP, Phase 2 Stand Out, Phase 3 Expand). The Phase 1/2/3 above are a separate scheme and do NOT map one-to-one to those. Always write "SR Phase N" for this file and "master-plan Phase N" for the plan, so the two are never confused.
- Cost type: `Free` = build time only, `Paid` = recurring or one-off money, `Ambiguous` = depends on scale or choice (see notes).
- Update the Status column and add a line to the Log whenever an item changes state.

## Working rules for this label

1. Production database: read-only unless the owner approves a specific change. Every schema change is applied to staging first, then production.
2. Anything bigger than a one-line change is verified on a preview URL before merging. Never merge to main until the owner has tested the preview.
3. Do not declare an item done until the owner has tested it.
4. No customer PII (names, emails, phones, addresses entered in proposal forms) in analytics, logs, or staging data. Staging gets schema only, never production rows.
5. Never paste or commit secrets. Tokens and passwords are never written to files in this repo.
6. Every call to the PRODUCTION database from the dev tools starts with `set transaction read only;`, and a before/after fingerprint (row counts, migration list, schema hashes) is compared. Known limit, verified on staging 2026-09-30: this blocks accidental writes (CREATE/INSERT fail with error 25006) but can be switched off deliberately (`set transaction read write`), and the connection is not allowed to assume Supabase's read-only role. A hard guarantee needs the MCP connector configured with `read_only=true&project_ref=<prod ref>` (Supabase docs), a setting only the owner can change. Supabase also advises against connecting MCP to production at all.

## Phase 1: safe to onboard real customers

| ID | Item | Status | Cost | Notes |
|---|---|---|---|---|
| SR-01 | Staging environment: second free Supabase project (Sydney), not paid Branching | in progress | Free | Created 2026-09-30: `fencely-staging`, ref `dehladkrsyozruyrpjgm`, Sydney, in the Fencely org (plan still `free` after creation). Per Supabase docs (billing-on-supabase, billing-faq): Free plan = 2 free projects; a paid org includes a $10 compute credit covering ONE project and each additional project costs about $10/month (Micro $0.01344/hr); free and paid projects cannot be mixed in one org. **Before upgrading the Fencely org to Pro (SR-07), transfer staging to a separate Free org (dashboard project transfer) or accept about +US$10/month.** Staging Postgres is 17.11, production 17.6 (platform patch difference). Not `done` until the owner has reviewed. |
| SR-02 | Export the live production schema (tables, constraints, indexes, RLS, functions, grants, storage bucket and policies) into `supabase/migrations` as a baseline; apply to staging; prove parity | in progress | Free | Done on staging 2026-09-30: `supabase/migrations/20260930200321_baseline.sql` plus `20260930200657_baseline_function_acl.sql` (a hand-made REVOKE on production that no migration recorded, found by the diff). Parity diff: all 8 object classes identical (columns, constraints, indexes, RLS flags, 12 policies, function, grants, bucket). Old 3 files archived in `supabase/migrations_legacy/`. Production unchanged (before/after fingerprint identical). **Open:** production's migration history (2 versions) does not match the baseline, so `supabase migration repair` (a metadata write to production) needs separate owner approval. Staging Auth settings (SMTP, email template, OTP length 6, rate limits) cannot be copied by the dev tools and must be set by the owner in the staging dashboard. |
| SR-03 | Point Vercel Preview env vars (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) at staging; keep Production on the live project | in progress | Free | Applied 2026-09-30 with owner approval. The two existing vars (`XvEznhKoMFkFG9g7` URL, `gmKgs559bOQ3dcG8` key) now target Production only; only `target` was edited, stored values untouched (ciphertext identical, nothing decrypted or retyped). New Preview-only vars: `cAqlpXEnAKhXoZOt` (staging URL `https://dehladkrsyozruyrpjgm.supabase.co`) and `O1qmMWB6F94dRFEk` (staging publishable key). The running production build is unaffected (Vite bakes values in at build time); the NEXT production build reads the Production-only vars. Preview verification result recorded in the Log. |
| SR-04 | Stop users changing their own `profiles.company_id` / `role` (company-switching hole) | not started | Free | P0 security. `profiles_update_own` has no WITH CHECK and UPDATE is granted on all columns. Reproduced on staging 2026-09-30: user A updated their own profile to company B and could then read B's quote. First migration to test on staging before production. |
| SR-05 | Drop the open `companies_insert_own` policy; revoke anon EXECUTE on `create_company_and_profile` | not started | Free | Unlimited company creation could fill the 500 MB free DB. Advisor flags the anon-executable function. |
| SR-06 | PostHog session replay: mask all text and delete existing recordings | not started | Free | Live in production. Only `input, textarea` are masked, so quote log and detail panel (name, phone, address) are recorded. Violates the no-PII rule. |
| SR-07 | Supabase Pro for daily backups and no idle pause; confirm a backup exists | not started | Paid | About US$25/month (verify at checkout). Interim option: DIY nightly dump (ambiguous: free but self-maintained). |
| SR-08 | Persist fence designs and background photos (tables `designs`, `photos` and bucket `yard-photos` already exist, unused) | not started | Free | Photo compression needed. Free storage quota is small (ambiguous at scale). |
| SR-09 | Per-company PDF branding (logo, name, ABN, phone, email, terms) from `companies.config` instead of hard-coded `CLIENT_CONFIG` | not started | Free | Today every PDF says "Fencely" with placeholder phone 0400 000 000 and info@fencely.com. |
| SR-10 | Map Measure: set Google Maps key with referrer restriction and spend cap | not started | Ambiguous | Production has no key, so it runs in "Simulated Local sandbox". $0 usage at current volume but a Google billing account with a card is required. |
| SR-11 | Terms of Service and Privacy Policy pages, links in the app, collection notice on the homeowner quote form | not started | Free | Generator up to about US$100 is optional (ambiguous). Must list outside services: Supabase (Sydney), Resend, PostHog (US), developer access from Pakistan. |
| SR-12 | Lawyer review of Terms, Privacy and Privacy Act position | not started | Paid | Rough estimate A$300-800, no sourced price. Not legal advice from this tool. |
| SR-13 | CI (GitHub Actions: type-check, tests, build) plus ESLint plus tests for login, onboarding, quote save/load | not started | Free | 14 pricing tests exist, nothing else is covered. |
| SR-14 | Protect `main`: pull request required, CI checks required | not started | Ambiguous | Repo is private, so needs a paid GitHub plan (about US$4/user/month, verify). |
| SR-15 | Error tracking (error boundary plus PostHog exceptions or Sentry) and uptime ping | not started | Ambiguous | Free tiers likely enough. No error boundary exists today. |
| SR-16 | Enable 2FA on GitHub, Vercel, Supabase, Hostinger, Resend; auto-renew and registrar lock on fencely.site | not started | Free | Owner action. |
| SR-17 | Verify SPF, DKIM, DMARC for fencely.site so login-code emails avoid spam | not started | Free | Owner action, DNS not checkable from the dev environment. |
| SR-18 | Revoke the Supabase personal access token that was pasted into chat; create a new one only when needed | not started | Free | Owner action at supabase.com/dashboard/account/tokens. |
| SR-39 | Replace the account-wide Supabase MCP connector with two scoped ones: `supabase-prod-ro` (`project_ref=ekhipvszzgwkweejifcf&read_only=true`) and `supabase-staging` (`project_ref=dehladkrsyozruyrpjgm`); remove the account-wide connector | in progress | Free | Owner action, walkthrough given 2026-09-30. Gives production a real technical read-only guarantee (queries run as `supabase_read_only_user`, server-side) instead of relying on discipline. Takes effect in a NEW session; tool names will change. Verify with harmless reads only (`select current_user`), never a write probe on production. |

## Phase 2: safe to charge

| ID | Item | Status | Cost | Notes |
|---|---|---|---|---|
| SR-19 | Billing: plan/trial columns on `companies`, Paddle checkout and webhook (Supabase Edge Function), feature gating | not started | Paid | Paddle takes about 5% + US$0.50 per sale, no monthly fee (master-plan figure, unverified). Needs SR-11 first. |
| SR-20 | Server-side check that quote `total` matches `line_items`; block edits to issued quotes | not started | Free | Today any user can insert or edit a quote with any total. |
| SR-21 | Delete a single quote, a customer, or an account; data retention rule | not started | Free | Today only "delete all quotes" exists. |
| SR-22 | "Download all my data" export (quotes, pricing, designs, photos) | not started | Free | Master plan promises this to customers. |
| SR-23 | Signup abuse protection (CAPTCHA, write limits) | not started | Free | Signup is open with no trial gate. |
| SR-24 | Confirm Vercel plan; Pro required for commercial use | not started | Paid | About US$20/seat/month if currently on Hobby. Tier not visible to the dev tools. |
| SR-25 | Confirm Resend plan and daily cap | not started | Ambiguous | Free plan: 3,000/month and 100/day. Each login code and invite is one email. |
| SR-26 | Independent human security review | not started | Paid | Master-plan estimate US$500-1,500 per review. Do before first paying customer. |
| SR-27 | Decide on leaked-password protection advisor warning | not started | Ambiguous | Toggle is Pro-tier. Low relevance with code-only login. |

## Phase 3: built to grow

| ID | Item | Status | Cost | Notes |
|---|---|---|---|---|
| SR-28 | Team invites and real role checks (admin vs user) | not started | Free | Needs an invitations table and a "join existing company" path in onboarding. |
| SR-29 | Admin/ops view for the owner (customers, last login, quote counts) | not started | Free | Gate by owner identity, not by the `admin` role (every user is an admin of their own company). |
| SR-30 | In-app support channel (help link, email, WhatsApp Business) | not started | Free | Nothing in the app today. |
| SR-31 | Usage analytics events keyed to company ID, never names or emails | not started | Free | PostHog installed, no custom events. |
| SR-32 | Quote won/lost lifecycle (status column, not buried in JSON) | not started | Free | Needed to measure conversion. |
| SR-33 | Split `FenceCanvas.tsx` (4,033 lines) | not started | Free | About 2 weeks spread out, paired with visible work. |
| SR-34 | Fix stale README and `.env.example` (removed password gate), add `PROJECT_NOTES.md` | not started | Free | |
| SR-35 | Move repo into a GitHub organisation when a second person joins | not started | Free | |
| SR-36 | Backup login-email provider | not started | Free | Login depends on one provider today. |
| SR-37 | Landing page hosting review (fencely.site is not in the Vercel team) and links between landing and app | not started | Free | Owner to say where the landing page is hosted. |
| SR-38 | Uptime status page; optional point-in-time recovery | not started | Ambiguous | PITR from about US$100/month, not needed yet. |

## Done before this label existed (context only)

- Code-only OTP login (6-digit code, magic link removed), with resend countdown matching the 60s email limit. Supabase `mailer_otp_length` corrected to 6.
- Tablet fixes: collapsed floating panels, visible Edit/Remove buttons, confirm dialogs for Reset and Clear, larger touch targets, Guide toolbar section.

## Log

- 2026-09-30: Tracker created. SR-01 to SR-03 (staging) plan proposed to owner, awaiting approval. No production or Vercel changes made.
- 2026-09-30: SR-03 applied and verified at bundle level. Preview build `dpl_7nvGuEGt5XTTkj4cpmZq6dgKhhdG` (commit ccc0aec, built after the env change) embeds only the STAGING Supabase host and staging's publishable key (0 mentions of production). Control: preview `dpl_8z8N24Cp6BA3yBopeLbzfxkuUL6b` (commit a874bb6, built before) embeds only the PRODUCTION host and a legacy anon JWT whose decoded `ref` claim is the production project. Same source, same CSS hash, different JS hash: the difference is the environment. Production deployment not rebuilt. Not yet tested: logging in on a preview (needs staging Auth settings, see SR-02 notes).
- 2026-09-30: Owner approved plan. Staging project created. Read-only guard tested on staging. Production inventoried read-only. Baseline migration written and applied to staging, parity diff clean after one fix, tenant isolation verified (user A sees only own company, anonymous sees nothing), SR-04 and SR-05 holes reproduced on staging. Production before/after fingerprint identical. Vercel change (SR-03) NOT applied, awaiting owner approval.
