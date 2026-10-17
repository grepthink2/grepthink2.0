# Security

GrepThink holds student records: names, school emails, team membership, peer reviews, meeting
attendance and grades-adjacent feedback. Please keep other people's data out of your testing:
use accounts you created, and stop at the first sign that you can read or change something that
is not yours.

## Reporting a vulnerability

Do not open a public issue. Report it privately, either way works:

- **GitHub:** this repository's *Security* tab → *Report a vulnerability*.
- **Contact form:** <https://grepthink2.com/contact>, with "Security" at the start of the subject.

Say what you found, how to reproduce it, and which roles are involved (student, TA, instructor,
or signed out). The maintainer reads both channels; please allow time for a fix before you
publish anything.

## Scope

In scope: this code, <https://grepthink2.com> and <https://api.grepthink2.com>. Out of scope:
vulnerabilities in Supabase, Vercel or Cloudflare themselves, denial of service, and social
engineering of users or staff.

Only the deployed `main` branch is supported; `beta` is the integration branch and may be ahead
of production.
