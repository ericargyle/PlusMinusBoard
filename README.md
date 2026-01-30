# PlusMinusBoard

A mobile + desktop web app for tracking “plus/minus” points and stories per person.

## Live on GitHub Pages
This repo is designed to be hosted from `/docs` via GitHub Pages.

## Backend: Supabase (shared across devices)
Because you asked for shared data (works on phone + desktop), this app uses **Supabase Postgres**.

### 1) Create Supabase project
1. Go to https://supabase.com/ and create a project.
2. In **Project Settings → API**, copy:
   - **Project URL**
   - **anon public key**

### 2) Create DB schema
In Supabase **SQL Editor**, run the SQL in `supabase/schema.sql`.

### 3) Configure the app
Edit `docs/config.js` and paste your values:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

### 4) Enable GitHub Pages
Repo → **Settings → Pages**
- Source: Deploy from a branch
- Branch: `main`
- Folder: `/docs`

Your URL will be:
`https://<your-username>.github.io/PlusMinusBoard/`

## Admin (hidden)
Tap the title **7 times** quickly to open the Admin panel.

## Notes on security
This is a client-side app; Supabase anon keys are public by design.
To keep it simple, the included policy is **open read/write** for this project.
If you want real access control later (PIN/auth/teams), we can add it.
