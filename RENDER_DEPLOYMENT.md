# Deploying Cab Fleet Tracker to Render.com

This project is a React 19 + Vite Single Page Application (SPA) with Progressive Web App (PWA) support and direct client-side Firebase integration.

The easiest and most cost-effective way to host this on Render is as a **Static Site** (free tier eligible, ultra-fast global CDN).

---

## Option 1: Automatic Blueprint (Recommended)

A `render.yaml` blueprint configuration has already been added to the root of this project.

1. Push this repository to **GitHub** or **GitLab**.
2. Log in to [dashboard.render.com](https://dashboard.render.com/).
3. Click **New +** → **Blueprint**.
4. Connect your Git repository.
5. Render will automatically detect `render.yaml` and configure:
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
   - **SPA Rewrites**: Route all paths `/*` to `/index.html`
   - **Headers**: Instant cache invalidation for `/sw.js` and `/manifest.json`

---

## Option 2: Manual Setup on Render Dashboard

If you prefer to create the service manually via Render's web UI:

1. Go to [Render Dashboard](https://dashboard.render.com/) and click **New +** → **Static Site**.
2. Connect your Git repository.
3. Configure the following settings:
   - **Name**: `cab-fleet-tracker` (or your preferred name)
   - **Branch**: `main` (or your active branch)
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`

### Crucial Setting: Single Page Application (SPA) Rewrite Rule
Since React uses client-side routing, you must ensure 404s route to `index.html`:
1. In your Static Site settings on Render, navigate to **Redirects/Rewrites**.
2. Add a rule:
   - **Type**: `Rewrite`
   - **Source**: `/*`
   - **Destination**: `/index.html`

---

## Firebase Authentication Domain Configuration

Once deployed on Render, Render will assign your app a URL (e.g. `https://cab-fleet-tracker.onrender.com` or your custom domain).

For Firebase Authentication (Driver Cab Login, Supervisor Login, etc.) to work seamlessly:
1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Select your Firebase project (`gen-lang-client-0220997920`).
3. Navigate to **Authentication** → **Settings** → **Authorized domains**.
4. Click **Add domain** and enter your Render domain:
   - Example: `cab-fleet-tracker.onrender.com`
   - (Also add your custom domain if you connect one).

---

## Environment Variables

The project reads its Firebase credentials directly from `firebase-applet-config.json` committed in the repository, so no mandatory runtime environment variables are strictly required for the static build.
