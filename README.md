# CDP Prototype — Anonymous Conversion Funnel

A working prototype of an in-house Customer Data Platform that demonstrates
unified user segmentation and multi-channel activation. Built for marketing
leadership demos.

## What this prototype proves

1. **Unified user profiles** — every visitor gets a single profile that
   aggregates all their behavior into one place.
2. **Priority-based segmentation** — each user is assigned to exactly one
   audience based on a clear priority order. No overlapping audiences, no
   ambiguity.
3. **Real-time activation** — when a user enters an audience, signals fire to
   the right channels (Meta, Google Ads, onsite modal, email/CRM).
4. **Controlled event consumption** — only meaningful segment changes trigger
   activations, not every page view.

## Tech stack

- **Frontend & API:** Next.js 14 (App Router) deployed to Vercel
- **Backend:** Supabase (Postgres + Realtime + Auto-generated APIs)
- **Styling:** Tailwind CSS with brand-neutral premium dark theme
- **Language:** TypeScript

Total cost: $0 on free tiers for prototype scale.

## Setup — first time (15 minutes)

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free account.
2. Click **New Project**. Pick a name, generate a strong database password
   (save it somewhere), and choose a region close to your users.
3. Wait ~2 minutes for the project to provision.

### 2. Run the database migrations

In your Supabase project dashboard:

1. Click **SQL Editor** in the left sidebar.
2. Click **New Query**.
3. Open `supabase/migrations/0001_initial_schema.sql` from this repo and copy
   its entire contents into the editor.
4. Click **Run** (bottom right).
5. You should see "CDP schema created successfully".
6. Repeat for `supabase/migrations/0002_segmentation_function.sql`.
7. Repeat for `supabase/migrations/0003_attributes_and_segments.sql` (adds new
   segments and the `user_attributes` column for sub-attributes).
8. Repeat for `supabase/migrations/0004_updated_segmentation.sql` (replaces
   the segmentation function with the expanded version that handles all 17
   primary segments + 7 sub-attributes).
9. Repeat for `supabase/migrations/0005_optimized_segmentation.sql`
   (performance fix for datasets of 5K+ users — replaces the segmentation
   function with a version that uses single-pass aggregations and an extended
   statement timeout).
10. Repeat for `supabase/migrations/0006_manual_activation.sql` (adds manual
    push capability, expanded channel list — Snap, TikTok, LinkedIn, YouTube,
    SMS, Email Marketing — and the auto-fire toggle).

> **If you already ran the prototype before:** migrations 0003 and 0004 are
> additive and safe to apply on top of an existing database. After running
> them, go to Admin → click "Reset Everything" → "Generate Dummy Data" → "Run
> Segmentation" to populate the new segments cleanly.

### 3. Enable Realtime on key tables

The dashboard updates live via Supabase Realtime — you need to enable it:

1. In Supabase, go to **Database → Replication**.
2. Find the `supabase_realtime` publication.
3. Enable replication for: `cdp_user_profiles`, `cdp_activations`,
   `cdp_events`.

### 4. Get your API credentials

1. In Supabase, go to **Settings → API Keys**.
2. Copy these three values:
   - **Project URL** (something like `https://abc123.supabase.co`)
   - **Publishable key** (starts with `sb_publishable_…`) — safe to expose in browser code
   - **Secret key** (starts with `sb_secret_…`) — server-side only, never expose to client

> Note: If you see older keys labeled `anon` and `service_role` in your project, those still work but the newer publishable/secret keys are recommended for new projects. They have clearer naming and can be rotated independently.

### 5. Set up the project locally

```bash
git clone <your-repo-url>
cd cdp-prototype
npm install
cp .env.example .env.local
```

Edit `.env.local` and paste the three values from Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=https://abc123.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
SUPABASE_SECRET_KEY=sb_secret_…
```

### 6. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You should see the
Overview page with empty stats. Go to **Admin** and follow the demo flow.

## Deployment to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial CDP prototype"
git branch -M main
# Create an empty repo on github.com first, then:
git remote add origin https://github.com/your-username/cdp-prototype.git
git push -u origin main
```

### 2. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. Click **Add New → Project**.
3. Import your `cdp-prototype` repo.
4. Before clicking **Deploy**, expand **Environment Variables** and add the
   three values from your `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
5. Click **Deploy**. Wait ~1–2 minutes.
6. Your site is live at `https://your-project.vercel.app`.

Pushing new commits to `main` automatically redeploys.

## Demo flow

A clean ~7 minute demo for marketing leadership:

1. **Open the Admin tab.** Talk through the steps. Optionally turn auto-fire
   OFF for a cleaner activation feed during demo.
2. **Click "Generate Dummy Data."** Wait ~15 seconds. Explain: "This is
   simulating 1,000 users across two months of website behavior — visitors,
   browsers, cart abandoners, registrants, customers."
3. **Click "Run Segmentation."** Watch the result panel. Explain: "This is
   what would run every 15 minutes in production. It rebuilds every user's
   profile, computes attributes, and assigns them to the highest-priority
   audience they qualify for."
4. **Open the Overview tab.** Show segment distribution.
5. **Open the Audiences tab.** Walk through each category. Show how
   sub-attributes (Mega7 affinity, high price tier) stack on top of primary
   segments.
6. ***The decision moment*** — pick an audience like "Abandoned Cart — High
   Value", click **Push to channels**, select Meta + Snap + Email, give it a
   campaign name, click confirm. Demonstrate the success state.
7. **Open the Builder tab.** Construct a custom audience: "High Intent +
   Mega7 affinity + Fresh recency". Watch the count update live. Push to
   channels. This is the moment that demonstrates the platform's flexibility
   beyond hard-coded segments.
8. **Open the Activations tab.** Switch to the **Manual** tab. Show your
   deliberate pushes — clearly marked, with campaign names and audience
   sizes. Switch to Auto if you want to show the firehose of background
   simulations.
9. **Open the User Lookup tab.** Click any user. Show their profile,
   attribute chips, segment, and full event history. Demonstrates that every
   audience decision is traceable.

## What's NOT in the prototype (intentional)

- Real Meta / Google Ads API integration (activations are simulated)
- Production-grade identity stitching across devices
- Consent management integration
- Authentication / role-based access on the admin panel
- Real-time event ingestion from a live website (events come from the dummy
  generator)
- High availability, monitoring, alerting

These are real production requirements — explicitly out of scope for proving
the model.

## Roadmap from prototype to production

**Phase 1 (this prototype):** Validate the data model, segment logic, and
activation pattern with dummy data. Get marketing leadership buy-in.

**Phase 2:** Replace dummy data with real GTM-fired events from the live
site. Add consent state to event schema. Wire up real Meta CAPI and Google
Ads Customer Match endpoints.

**Phase 3:** Add cross-device identity stitching, sub-attributes for
personalization (game affinity, drop-off step), and orchestrated multi-touch
journeys.

**Phase 4:** Production hardening — monitoring, alerting, data residency
compliance, GDPR workflows, role-based access control.

## File structure

```
cdp-prototype/
├── app/
│   ├── api/                Next.js API routes (ingest, segment, generate, reset)
│   ├── audiences/          Audiences detail page
│   ├── users/              User lookup page
│   ├── activations/        Live activations feed
│   ├── admin/              Generate / run / reset controls
│   ├── globals.css         Tailwind + base styles
│   ├── layout.tsx          Root layout with nav
│   └── page.tsx            Overview / landing
├── components/
│   ├── ui/                 Reusable Button, Card, Badge components
│   └── Nav.tsx             Top navigation
├── lib/
│   ├── supabase.ts         Supabase client setup
│   ├── segments.ts         Segment definitions (single source of truth)
│   ├── segmentation.ts     Segmentation engine wrapper
│   ├── dummy-data.ts       Realistic dummy event generator
│   └── utils.ts            Formatting helpers
├── supabase/
│   └── migrations/
│       ├── 0001_initial_schema.sql
│       └── 0002_segmentation_function.sql
└── README.md (this file)
```

## Customizing for Emirates Draw branding

When real brand guidelines arrive, the only file you need to touch is
`tailwind.config.ts`. Update the `brand` color tokens — the entire UI
re-themes automatically.

```ts
// tailwind.config.ts
brand: {
  bg: "#yourBrandBg",
  surface: "#yourBrandSurface",
  accent: "#yourBrandAccent",
  // …
}
```

To change segment names or descriptions: edit `lib/segments.ts`. Single
source of truth — the whole UI updates.

## Support

This is a prototype. If something breaks during a demo, the fastest fix is
usually:

1. Open Admin → click Reset Everything.
2. Click Generate Dummy Data.
3. Click Run Segmentation.
