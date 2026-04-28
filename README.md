# Criterion College — School Website + Result System

A complete school management platform combining a public-facing website with the Criterion Result Management System backend. Single deployment on Render, single PostgreSQL database.

## What's Included

| Layer | Description |
|-------|-------------|
| **Backend** | Node.js + Express API (extended from original Criterion system) |
| **Database** | PostgreSQL — Neon or any Postgres provider |
| **Website** | Multi-page school website (HTML/CSS/JS, no build step) |
| **Student Portal** | Login with Student ID + PIN, view results |
| **Teacher Portal** | View management notices and announcements |
| **Admin** | Full Criterion dashboard (students, results, admissions, receipts) |

## Quick Start (Local)

```bash
git clone <your-repo-url>
cd criterion-college
npm install
cp .env.example .env
# Edit .env — set DATABASE_URL and JWT_SECRET
node server.js
```

Open http://localhost:3000

**Default admin login:** `admin` / `admin123`  
> Change this immediately after first login via Settings.

## Deploy to Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Render auto-detects `render.yaml` → click **Deploy**
5. Set environment variables:
   - `DATABASE_URL` — your Neon/Postgres connection string
   - `JWT_SECRET` — Render can generate this automatically
   - `ALLOWED_ORIGINS` — your custom domain (e.g. `https://criterioncollege.edu.ng`)
6. Done — your URL will be `https://criterion-college.onrender.com`

## Database

Uses PostgreSQL (recommended: [Neon](https://neon.tech) — free tier).

The schema is created automatically on first boot. No manual migrations needed.

## Pages

### Public
| URL | Page |
|-----|------|
| `/` | Home |
| `/pages/about.html` | About Us |
| `/pages/academics.html` | Academics |
| `/pages/admissions.html` | Admissions Info |
| `/pages/apply.html` | Application Form |
| `/pages/admission-status.html` | Check Application Status |
| `/pages/news.html` | News & Events |
| `/pages/gallery.html` | Photo Gallery |
| `/pages/contact.html` | Contact |

### Portals
| URL | Who |
|-----|-----|
| `/pages/login.html` | Unified login (Student / Teacher / Admin) |
| `/pages/student-portal.html` | Student dashboard (results) |
| `/pages/teacher-portal.html` | Teacher/Staff notice board |

## API Routes

### Public
- `POST /api/admission/apply` — Submit admission application
- `GET  /api/admission/status/:ref` — Check application status by reference number
- `GET  /api/share/:token` — View shared result (existing feature)

### Student
- `POST /api/student-login` — Login with Student ID + PIN
- `GET  /api/student/profile` — Student profile (JWT required)
- `GET  /api/student/results` — All results for logged-in student
- `GET  /api/student/results/:session/:term` — Specific result

### Staff (JWT required)
- `POST /api/login` — Staff login (admin/teacher/bursar)
- `GET  /api/notices` — Read notices for your role
- All existing Criterion routes (students, results, settings, receipts...)

### Admin only
- `POST /api/notices` — Create notice
- `PUT  /api/notices/:id` — Update notice
- `DELETE /api/notices/:id` — Delete notice
- `GET  /api/student-logins` — List all student login accounts
- `POST /api/student-logins` — Create student login (studentId + studentIdCode + pin)
- `DELETE /api/student-logins/:studentId` — Remove student login
- All admission management routes

## Setting Up Student Logins

Student logins are created by the admin. In the admin dashboard:

1. Go to the existing Students list
2. For each student, use the API to create a login:

```bash
curl -X POST https://your-app.onrender.com/api/student-logins \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"studentId":"<db-id>","studentIdCode":"CC2025-001","pin":"1234"}'
```

The `studentIdCode` is what the student types at login (e.g. `CC2025-001`).  
The `pin` is a 4–6 digit number you assign. Share it with the student securely.

## Customisation

- **School name/colours**: Edit `public/js/layout.js` (nav/footer) and `public/css/style.css` (CSS variables)
- **Contact details**: Edit the footer in `layout.js` and `public/pages/contact.html`
- **Fee schedule**: Edit `public/pages/admissions.html`
- **News/events**: Edit `public/pages/news.html` (or wire to a CMS/database later)
- **Google Maps**: Replace the placeholder div in `contact.html` with a `<iframe>` from Google Maps

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | JWT signing secret (long random string) |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | `production` or `development` |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins |
