# Cornerstone music site

The music team's roster and song chooser, at packages.dunnerstunner.co.nz/music. Hosted here for now; it is a
Cornerstone project, not part of the agency portal, and shares nothing with it except the hosting and the
`../wellbeing/supabase.min.js` library file.

- `index.html`: the whole site. Plain file, no build step. `?demo` opens it with made-up people and saves nothing.
- `migrations/`: the exact SQL applied to its own Supabase project, `cornerstone-music` (`cimksrrmmbtauowrywlh`, Sydney).
  Never point this site at the agency database, and never put church data in the agency database.
- `fn/mail.ts`: the `music-mail` edge function (sign-in links and the email queue). Deployed by a tiny index.ts that
  imports this file from raw GitHub pinned to a commit SHA, so push first, then deploy.

No personal data in this folder, ever: people, roster and songs live only in the database.
Emails stay off until a sender is set (secrets MAIL_FROM plus RESEND_API_KEY, or SMTP_USER and SMTP_PASS) and
`private.settings.emails_on` is 'true'.

Access: every table has Row Level Security. Members read; admins run people and the roster; the song leader or an
admin picks songs; swaps and confirming songs go through security-definer functions. Only a webmaster can make or
change a webmaster.

NZ English, no em dashes, phone first.
