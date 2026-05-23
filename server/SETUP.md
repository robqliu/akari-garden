# Server setup

Steps to get the backend running locally and in production.

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

## Production (Cloudflare Workers)

1. **Create the KV namespace:**

   Run from anywhere — this is an account-level operation, it doesn't
   read any local config:

   ```
   pnpm dlx wrangler@latest kv:namespace create USERS_KV
   ```

   (`pnpm dlx` downloads and runs wrangler without a global install.
   You can also use `npx wrangler@latest` or a globally installed
   `wrangler` — they're equivalent.)

   It will print an `id` value. Paste that into `server/wrangler.jsonc`
   under the `kv_namespaces` entry, replacing
   `REPLACE_WITH_REAL_KV_NAMESPACE_ID`. Commit and push the change.

2. **Set Worker secrets:**

   Also account-level, run from anywhere:

   ```
   pnpm dlx wrangler@latest secret put GOOGLE_CLIENT_ID
   pnpm dlx wrangler@latest secret put GOOGLE_CLIENT_SECRET
   pnpm dlx wrangler@latest secret put SESSION_SIGNING_KEY
   pnpm dlx wrangler@latest secret put PUBLIC_API_URL
   ```

   Each command prompts you to paste the value. Use the same values
   from your `server/.env` file, except `PUBLIC_API_URL` should be the
   deployed Worker's origin, e.g.
   `https://akari-garden-api.<account>.workers.dev`.

3. **Add the production redirect URI** to the Google OAuth client from the local dev setup:

   ```
   https://akari-garden-api.<account>.workers.dev/api/auth/google/callback
   ```

4. **Deploy:**

   Deploys happen automatically via the `deploy_api` job in `.github/workflows/cloudflare.yml` on push to `main`.
