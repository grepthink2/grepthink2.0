# Login email change — design

**Date:** 2026-10-05 · **Status:** approved for implementation (unattended session; the
maintainer asked for "a small email change flow where one can update their email through
profile settings explicitly, send them a confirmation email to the new address after").

## Goal

A signed-in user can change the address they log in with from Settings → Profile. The new
address receives a confirmation email. Nothing about the account changes until that link is
opened, and the app's own copy of the address (`profiles.email`) follows the change by itself.

## Where the login email lives

The login email is Supabase Auth's (`auth.users.email`); every access token carries it as the
`email` claim. `profiles.email` is a mirror written once by `POST /api/create-user` from the
token (AUTH.md, "The email is the token's"). Nothing updates that mirror today: no trigger in
`supabase/auth_glue.sql`, no backend code.

## Approaches considered

1. **Supabase Auth's own email change, plus a backend mirror (chosen).** The browser calls
   `supabase.auth.updateUser({ email })`. Supabase emails the new address a confirmation
   link (its "Change Email Address" template) and applies the change only when the link is
   opened. Afterwards the token's `email` claim is the new address, and
   `GET /api/profiles/me` copies it into `profiles.email`. No schema change, no new route,
   no email sending of our own.
2. **A 6-digit code flow of our own, finished with `auth.admin.update_user_by_id`.** The
   backend would mail a code (like the roster-email verification), then set the new address
   with `email_confirm`. It needs a pending-codes table or a column rename on
   `edu_email_verifications`, i.e. a migration applied by hand on dev and prod before the
   code can ship, for a flow Supabase already provides. Rejected.
3. **`auth.admin.generate_link(type="email_change_new")` sent through our mailer.** Same
   confirmation link, our own email copy. With Supabase's default "Secure email change"
   setting the change also needs the current address's link, so the backend would have to
   generate and send both. More code for the same result. Rejected.

## Design

### Settings (frontend)

- The read-only "Email Address" field in Settings → Profile gets a **Change** button.
- It opens `ChangeEmailModal` (`features/app/components/Settings/`), built on the
  `join-class-modal` shell `EduVerifyModal` uses and the `settings-modal` field styles:
  one email input and a "Send confirmation" button.
- On submit the modal:
  1. refuses an address equal to the current one, and one that is not a plain mailbox;
  2. asks `api.checkEmail` whether the address is free, as the roster-email flow does,
     and shows "This email is already linked to another account." when it is not;
  3. calls `supabase.auth.updateUser({ email }, { emailRedirectTo:
     `${origin}/auth/callback?source=email-change` })`;
  4. on success shows: "We sent a confirmation link to NEW. Your login email stays OLD
     until you open it. If your current address also receives a link, open both."
     A Supabase error is shown as returned.
- The session's `user.email` is what the field shows, so it changes on its own once the
  confirming device holds the new session.

### The emailed link (frontend)

- With Supabase's default template the link goes through Supabase's verify endpoint and
  lands on `/auth/callback?source=email-change` with a PKCE `code`. `AuthCallback`
  already exchanges it and routes a user with a role to `/app/home`; `source` values it
  does not know are treated like signup, which is right here. Opened in another browser
  the exchange cannot complete and the page times out to `/login`; the change itself has
  already been applied, so signing in with the new address works.
- With a `token_hash` template (the recommended one, as for password resets) the link
  lands on `/auth/confirm?token_hash=…&type=email_change`. `AuthConfirm` verifies it with
  `verifyOtp` and now picks the destination by type: `email_change` → `/app/home`; the
  recovery default `/reset-password` is unchanged.

### The mirror (backend)

- `GET /api/profiles/me` takes the verified token payload. When the token carries an
  `email` and it differs from `profiles.email` (compared lower-cased), the controller
  writes the token's address to the row before returning it, with an info log naming the
  user id only. No claim, no write. This is the same rule `create_user` follows: the
  identity column comes from the token, never from a request body.
- Why here and not a new route: the profile is read on every page load
  (`AuthProvider`) and whenever Settings opens, on whichever device the link was opened,
  so the mirror heals on the first request after the change with no client code and no
  catalog entry. The write is idempotent and happens only on a mismatch.
- `profiles.edu_email` is not touched. It is proven separately and may legitimately
  differ from the login email.

### What a changed address means elsewhere

- Roster matching by `profiles.email` (`app/classes/controller.py`) follows the new
  address; rows already matched by `matched_profile_id` keep their link. Students whose
  roster row was matched by the old login email should verify it as their roster email
  (`edu_email`) if it was a school address — the existing Settings field does that.
- Google-only accounts can change the address too; they keep signing in with Google and
  their token then carries the new address. Nothing in the app depends on the two
  agreeing.

### Dashboard settings this relies on (not code)

- Authentication → Email Templates → **Change Email Address**: a `token_hash` link to
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change` works
  from any browser; the default `{{ .ConfirmationURL }}` works in the browser that asked.
- Authentication → **Secure email change** (on by default): the current address also
  gets a link and both must be opened. The modal's copy covers both settings.
- Redirect URLs already allow `/auth/callback`.

## Tests

- Backend (`tests/test_auth_hardening.py`): `GET /api/profiles/me` with a token whose
  email differs rewrites `profiles.email`; an equal address (any case) writes nothing; a
  token without an email claim writes nothing.
- Frontend: `Settings.changeEmail.test.tsx` — the button opens the modal; a taken address
  is refused before Supabase is called; a free one calls `updateUser` with the address
  and the callback redirect and shows the confirmation copy; a Supabase error is shown.
  `AuthConfirm.test.tsx` — `type=email_change` lands on `/app/home`, a recovery link on
  `/reset-password`.

## Out of scope

Changing the roster email (exists), notifying the old address ourselves (Supabase's
secure change already does), and an admin path to change someone else's address.
