# Server setup

## Local dev

Each developer creates their own Google OAuth client so there's no
shared secret to distribute and no interference between devs' testing
accounts.

1. **Create a Google Cloud OAuth client:**

   - Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
     Create a project first if you don't have one.
   - Click **Create Credentials → OAuth client ID**, type **Web application**.
   - Add `http://localhost:3000/api/auth/google/callback` as an **Authorized redirect URI**.
   - Go to the **OAuth consent screen** settings, set the publishing
     status to **Testing**, and add your own Google account as a test user.
   - Copy the **Client ID** and **Client secret** from the credentials page.

2. **Set environment variables:**

   ```
   cp server/.env.example server/.env
   ```

   Paste the Client ID and Client secret from step 1 into `GOOGLE_CLIENT_ID`
   and `GOOGLE_CLIENT_SECRET`. Generate a signing key:

   ```
   openssl rand -hex 32
   ```

   Paste it into `SESSION_SIGNING_KEY`.

3. **Install dependencies and start:**

   ```
   pnpm install
   pnpm --filter @akari-garden/server dev
   ```

   The server runs at `http://localhost:3000`.
