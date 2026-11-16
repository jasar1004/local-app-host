# Local App Host notifications

This Worker stores reminder schedules and sends Web Push messages to the Local App Host service worker. It stores only the push subscription, device token hash, and reminder title/body/time. The reminder text is readable by this Worker while stored in D1.

## Deploy to Cloudflare

Requirements: Node.js 22 or newer and a Cloudflare account.

1. Open PowerShell in this folder and install dependencies:

   ```powershell
   npm install
   ```

2. Generate a VAPID key pair:

   ```powershell
   node scripts/generate-vapid-keys.mjs
   ```

   Copy the public key into `wrangler.jsonc` as `VAPID_PUBLIC_KEY`. Keep the private key secret.

3. Sign in and create the database:

   ```powershell
   npx wrangler login
   npx wrangler d1 create local-app-host-notifications
   ```

   Copy the returned database ID into `wrangler.jsonc`, replacing `REPLACE_WITH_D1_DATABASE_ID`.

4. Store the private VAPID key as a Worker secret. Paste the private key when prompted:

   ```powershell
   npx wrangler secret put VAPID_PRIVATE_KEY
   ```

5. Apply the database schema and deploy:

   ```powershell
   npx wrangler d1 migrations apply local-app-host-notifications --remote
   npx wrangler deploy
   ```

Cloudflare prints a Worker URL ending in `.workers.dev`. Paste that URL into Local App Host’s **Notification server URL** field.

## Enable notifications on iPhone

Open Local App Host from its Home Screen icon, enter the Worker URL, and tap **Enable notifications**. Accept the iOS permission prompt. The Home Screen web app must use iOS/iPadOS 16.4 or newer. A Worker Cron Trigger checks due reminders once per minute, so delivery is approximate to the minute rather than exact to the second.

## Hosted app API

Hosted apps can schedule or cancel reminders through the injected `window.localAppHost` API:

```js
await window.localAppHost.scheduleReminder({
  id: 'water-break-1',
  title: 'Time for a break',
  body: 'Stand up and stretch.',
  at: Date.now() + 30 * 60 * 1000
});

await window.localAppHost.cancelReminder('water-break-1');
```

The `id` must be stable for a reminder. Calling `scheduleReminder` again with the same ID updates its time and text. The app must be open when it creates or changes a schedule. Existing apps need to call this API; Local App Host cannot infer reminder schedules from their timers.

Reminder titles and bodies are stored in D1 and sent to Apple’s push service in an encrypted Web Push payload. Do not include sensitive journal or health details in reminder text.
