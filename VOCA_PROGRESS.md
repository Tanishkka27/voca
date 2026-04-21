## EPIC 1 - Milestone 1.1 (Project Setup)

### Completed:

* Next.js app initialized
* TailwindCSS configured
* shadcn/ui setup completed
* Prisma ORM connected to Supabase
* Clean scalable folder structure created

### Tech Stack:

* Next.js 14
* TypeScript
* Supabase (PostgreSQL)
* Prisma ORM

### Notes:

* Initial project setup completed successfully

### Status:

✅ Ready for next milestone

## EPIC 1 - Milestone 1.2 (GitHub OAuth)

### Completed:

* NextAuth.js configured with GitHub provider
* GitHub OAuth login working
* User stored in Supabase via Prisma
* Access token stored securely
* Protected dashboard route implemented

### Notes:

* Authentication flow tested successfully

### Risks:

* Token refresh handling not implemented yet

### Status:

✅ Auth system ready

## EPIC 1 - Milestone 1.3 (Repo Fetch & Selection)

### Completed:

* GitHub repo fetching implemented
* Secure API route created (/api/repos)
* Repo selection UI built
* Selected repo stored in database

### Notes:

* GitHub API integration stable

### Risks:

* Large repo lists may need pagination later

### Status:

✅ Repo selection working

### Issues Faced:

- Fetch API returned HTML instead of JSON due to missing credentials in frontend request
- Prisma failed to connect to Supabase using direct DB URL (IPv6 issue)
- Incorrect Supabase pooler port used initially (5432 instead of 6543)
- Prisma connection repeatedly failed due to VPN interference

### Fixes Applied:

- Added `credentials: 'same-origin'` in frontend fetch requests
- Ensured API returns JSON (401) instead of redirect
- Switched to Supabase IPv4 pooler connection
- Corrected port to 6543 for pooler
- Disabled VPN to allow database connection

### Infra Learnings:

- Supabase direct DB connections may fail on IPv6-restricted networks
- Prisma requires special handling with Supabase pooler (`pgbouncer=true`)
- Network conditions (VPN, firewall) can silently break DB connectivity
- Always validate API responses (HTML vs JSON) when debugging auth issues

### Improvements (Future):

- Add repo pagination for large accounts
- Cache repo list to reduce GitHub API calls
- Add retry handling for GitHub API failures

