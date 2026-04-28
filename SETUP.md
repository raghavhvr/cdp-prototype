# Quick Start — 15 minutes

## 1. Supabase (5 min)

1. Create free account at [supabase.com](https://supabase.com) → New Project
2. Wait ~2 min for provisioning
3. **SQL Editor** → New Query → paste contents of `supabase/migrations/0001_initial_schema.sql` → Run
4. **SQL Editor** → New Query → paste contents of `supabase/migrations/0002_segmentation_function.sql` → Run
5. **Database → Replication** → enable replication for `cdp_user_profiles`, `cdp_activations`, `cdp_events`
6. **Settings → API Keys** → copy: Project URL, **publishable key** (`sb_publishable_...`), **secret key** (`sb_secret_...`)

## 2. Local run (5 min)

```bash
npm install
cp .env.example .env.local
# Edit .env.local — paste your 3 values from Supabase
npm run dev
```

Open http://localhost:3000

## 3. Vercel deploy (5 min)

```bash
git init && git add . && git commit -m "Initial CDP prototype"
# Create empty repo on github.com, then:
git remote add origin https://github.com/YOUR-USERNAME/cdp-prototype.git
git push -u origin main
```

Then on [vercel.com](https://vercel.com):
1. Add New → Project → Import your repo
2. Expand Environment Variables → add all 3 from `.env.local`
3. Deploy

## Demo (5 min)

1. Open `/admin`
2. Click **Generate Dummy Data** (1000 users) → wait ~15 sec
3. Click **Run Segmentation** → wait ~5 sec
4. Walk stakeholders through `/`, `/audiences`, `/users`, `/activations`

## Reset between demos

`/admin` → **Reset Everything** → Generate → Segment → repeat
