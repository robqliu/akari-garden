# Server setup

## Local dev

1. **Install dependencies** (from the repo root):

   ```
   pnpm install
   ```

2. **Create a Google OAuth client:**

   - Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
   - Create an OAuth client ID, type **Web application**.
   - Add `http://localhost:3000/api/auth/google/callback` as an **Authorized redirect URI**.
   - In the **OAuth consent screen** settings, set the app to **Testing** mode and add your Google account as a test user.

3. **Set environment variables:**

   ```
   cp server/.env.example server/.env
   ```

   Fill in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from step 2. Generate a signing key:

   ```
   openssl rand -hex 32
   ```

4. **Start the dev server:**

   ```
   pnpm --filter @akari-garden/server dev
   ```

   The server runs at `http://localhost:3000`.
