# Photo Studio Marketplace

## Soft Launch Mode

The app is set up for a first production-style launch where prices are visible, booking requests are real, and payment happens directly at the studio. Keep `MANUAL_PAYMENT_MODE=true` until platform checkout, payouts, refunds, and receipts are ready.

## Required Env

Copy `.env.example` to `.env.local` for local work and fill production values in your deployment provider:

- `DATABASE_URL` for PostgreSQL and Prisma.
- `RESEND_API_KEY` and `EMAIL_FROM` for 6-digit owner email codes.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` for owner media.
- `TELEGRAM_BOT_TOKEN` and optional `TELEGRAM_WEBHOOK_SECRET` for owner intake.
- `OPENAI_API_KEY` for AI-assisted listing drafts.
- `MANUAL_PAYMENT_MODE=true` for direct studio payment.

## Local PostgreSQL Setup

Use any PostgreSQL 15+ instance. For local development, create a database named `photo_studios`, then set:

```powershell
$env:DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/photo_studios"
```

## Prisma Setup

```powershell
npm run db:generate -w apps/api
npm run db:push -w apps/api
```

Run `db:push` against the production database before the first owner test. Use migrations instead of `db:push` once the schema needs audited rollout history.

## Cloudflare R2 Setup

1. Create an R2 bucket for owner media.
2. Create an access key with object read/write access to that bucket.
3. Configure a public or custom domain for served media.
4. Fill `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and `R2_PUBLIC_BASE_URL`.

Owner uploads store private storage keys internally and return only public media URLs to the app.

## Resend Setup

1. Verify the sending domain in Resend.
2. Set `RESEND_API_KEY`.
3. Set `EMAIL_FROM` to a verified sender such as `Photo Studios <hello@your-domain.com>`.
4. Test the owner email OTP flow from the web drawer before inviting studios.

## Telegram Bot Setup

Run the API on your public domain, then register the owner webhook:

```powershell
$env:TELEGRAM_BOT_TOKEN="..."
curl "https://api.telegram.org/bot$env:TELEGRAM_BOT_TOKEN/setWebhook?url=https://your-domain.com/api/telegram/webhook"
```

Owners can send text or photos to the bot. Text creates a studio draft; photos are attached to the draft flow. Publishing still requires verified email from the web.

If `TELEGRAM_WEBHOOK_SECRET` is set, include the same secret when configuring the webhook so inbound requests pass the `x-telegram-bot-api-secret-token` check.

## Owner Web Chat Test

1. Open `http://localhost:5173/`.
2. Click `List your studio`.
3. Add studio description and photos.
4. Create a draft.
5. Add email and verify the 6-digit code.

## Telegram Owner Onboarding Test

1. Open the bot in Telegram.
2. Send a short studio description.
3. Send at least one room photo.
4. Confirm the API stores the photo through R2 and attaches it to the latest draft.
5. Open the web app and finish email verification before publish.

## Booking Test

1. Open a studio.
2. Request or confirm a slot.
3. Verify price is visible.
4. Confirm there is no card entry, checkout, payment capture, or receipt UI.
5. Booking copy should say payment is direct with the studio.

## Manual Payment Limitations

Manual payment mode does not collect cards, deposits, payouts, refunds, invoices, or platform receipts. The marketplace shows price and booking status, then the client pays the studio directly according to the studio terms. Keep `MANUAL_PAYMENT_MODE=true` until platform checkout and payout operations are fully designed and tested.

## Soft Launch Checklist

- `DATABASE_URL` points to the production PostgreSQL database and `npm run db:push -w apps/api` has run.
- Resend sender domain is verified and owner email codes arrive in under one minute.
- R2 bucket, credentials, and public base URL are configured; owner photo uploads return public images.
- Telegram bot token is configured and `/api/telegram/webhook` is registered with the webhook secret.
- `OPENAI_API_KEY` is configured, or the fallback draft generator is acceptable for the first owner test.
- `MANUAL_PAYMENT_MODE=true` is set in production.
- Web owner chat can create a draft, upload photos, verify email, and publish.
- Telegram owner flow can create a text draft and accept photos.
- Public listing API (`/api/studios/:slug`) hides owner/private fields.
- Booking flow shows prices and direct studio payment instructions, with no online payment capture.
