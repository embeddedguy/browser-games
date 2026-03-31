# Fleet Asset Management App — Final Product Plan

## Decisions Log

| # | Decision |
|---|---|
| Architecture | Node.js + Express + SQLite (better-sqlite3) + JWT auth. Shared data over LAN. |
| Workshop intake | Supervisor-only formal intake. Techs can only "Flag as Unserviceable." |
| Location field | Admin-managed predefined site/sub-location list. Pre-loaded with 5 sites × 4 sub-locations. |
| Tech status control | Removed. Status driven by workflow actions only (flag, intake, deploy, release). |
| Field disable | Techs use "Flag as Unserviceable" (requires a reason). Supervisor confirms → sets Disabled. |

---

## Architecture

### Stack
| Layer | Technology | Why |
|---|---|---|
| Server | Node.js + Express 4.x | Simple, standard, runs on Windows |
| Database | SQLite via better-sqlite3 | File-based, no DB server, pre-built Windows binaries |
| Auth | JWT (jsonwebtoken) | Stateless, stored in localStorage on client, 24hr expiry |
| Frontend | Single HTML file (public/fleet.html) | Served as static file from Express |

### Project Structure
```
fleet-manager/
  server.js          — Express entry point, binds 0.0.0.0:3000
  package.json       — deps: express, better-sqlite3, jsonwebtoken, cors
  start.bat          — double-click launcher (Windows)
  start.sh           — bash launcher (Mac/Linux)
  database.js        — DB connection, schema migrations, seed data
  routes/
    auth.js          — POST /api/auth/login, POST /api/auth/logout
    assets.js        — CRUD assets + states
    workshop.js      — workshop job management
    users.js         — user management (admin only)
    services.js      — service catalog
    locations.js     — location list
    reports.js       — dashboard stats, audit log, export
  public/
    fleet.html       — full frontend (inline CSS + JS, fetches API)
  data/
    fleet.db         — SQLite file (auto-created on first run)
```

### Deployment (user-facing instructions)
1. Install Node.js 20 LTS from nodejs.org (one-time)
2. Place the `fleet-manager/` folder anywhere
3. Double-click `start.bat`
4. App runs at `http://localhost:3000` (PC) and `http://[PC-IP]:3000` (iPads on same network)
5. Windows Firewall will prompt on first run — allow for private networks

---

## User Roles & Permissions

| Capability | user | tech | supervisor | admin |
|---|:---:|:---:|:---:|:---:|
| View asset list + search | ✓ | ✓ | ✓ | ✓ |
| Update asset location (from predefined list) | ✓ | ✓ | ✓ | ✓ |
| Set status to Deployed | ✓ | ✓ | ✓ | ✓ |
| View service history | ✓ | ✓ | ✓ | ✓ |
| Flag asset as Unserviceable (requires reason) | | ✓ | ✓ | ✓ |
| Log a service entry | | ✓ | ✓ | ✓ |
| View "My Jobs" (assigned workshop jobs) | | ✓ | ✓ | ✓ |
| Formally intake asset to workshop | | | ✓ | ✓ |
| Assign technician to workshop job | | | ✓ | ✓ |
| Set job priority + status within workshop | | | ✓ | ✓ |
| Release asset from workshop | | | ✓ | ✓ |
| View workshop queue board | | | ✓ | ✓ |
| View fleet health dashboard | | | ✓ | ✓ |
| View audit log | | | ✓ | ✓ |
| Manage users | | | | ✓ |
| Register / manage assets | | | | ✓ |
| Manage service catalog | | | | ✓ |
| Manage locations list | | | | ✓ |
| Export fleet report | | | | ✓ |

---

## SQLite Schema

```sql
users         (id, username, password_hash, display_name, role, created_at)
assets        (id, serial, description, registered_by, registered_at)
asset_states  (id, asset_id, location_id, custom_location, status,
               flagged, flag_reason, last_updated_by, last_updated_at)
               -- status: Onsite | Deployed | Disabled
               -- flagged: 0|1, flag_reason: text
workshop_jobs (id, asset_id, assigned_tech_id, job_status, priority,
               parts_notes, flagged_by, intake_by, intake_at,
               released_by, released_at)
               -- job_status: Flagged | Waiting | In Progress | Awaiting Parts | Ready for Release
               -- priority: Urgent | Normal | Scheduled
service_log   (id, asset_id, workshop_job_id [nullable], service_id,
               service_name, logged_by_id, logged_by_name, logged_by_role,
               timestamp, notes)
               -- workshop_job_id NULL = standalone entry; set = job-scoped, still shows in asset history
               -- logged_by_role denormalized (Technician | Supervisor | Admin) so label survives role changes
services      (id, name, active, created_at)
locations     (id, site_name, sub_location, is_custom, active)
               -- is_custom: 0 = admin-managed, 1 = user-contributed via "Other" field
               -- full display: "[site_name] — [sub_location]"
app_settings  (key, value, updated_by, updated_at)
               -- e.g. key='downtime_warning_days', value='5'
audit_log     (id, user_id, user_name, user_role, action, entity_type,
               entity_id, details_json, timestamp)
```

### Pre-loaded Locations (seeded on first run)
| Site | Sub-locations |
|---|---|
| Main Depot | Workshop, Storage Yard, Parking Bay, Fueling Station |
| North Site | Workshop, Laydown Area, Site Entrance, Fuel Point |
| South Site | Workshop, Equipment Park, Materials Storage, Guard Post |
| East Yard | Workshop, Heavy Equipment Bay, Parts Store, Wash Bay |
| West Compound | Workshop, Open Yard, Container Storage, Office Park |

---

## API Routes

```
POST   /api/auth/login                   — login, return JWT
POST   /api/auth/logout                  — invalidate token (client-side)

GET    /api/assets                       — all assets + states
POST   /api/assets                       — register asset (admin)
GET    /api/assets/:id                   — single asset + state
PATCH  /api/assets/:id/state             — update location/status/message
POST   /api/assets/:id/flag              — flag as unserviceable (tech+)
GET    /api/assets/:id/log               — service history
POST   /api/assets/:id/log               — add log entry (tech+)

GET    /api/workshop                     — all active workshop jobs
POST   /api/workshop                     — create intake from flag (supervisor+)
PATCH  /api/workshop/:jobId              — update job status/priority/assignment
POST   /api/workshop/:jobId/release      — release asset (supervisor+)

GET    /api/users                        — list users (admin)
POST   /api/users                        — create user (admin)
PATCH  /api/users/:id                    — update user (admin)
DELETE /api/users/:id                    — delete user (admin)

GET    /api/services                     — list services
POST   /api/services                     — add service (admin)
PATCH  /api/services/:id                 — activate/deactivate (admin)

GET    /api/locations                    — list locations
POST   /api/locations                    — add location (admin)
PATCH  /api/locations/:id                — activate/deactivate (admin)

GET    /api/reports/dashboard            — fleet health stats (supervisor+)
GET    /api/reports/audit                — audit log (supervisor+)
GET    /api/reports/export               — printable fleet status (admin)
```

---

## Views (Frontend)

```
login                  — JWT login
dashboard              — asset list + search bar + "My Jobs" section for tech
  └─ fleet-summary bar — (supervisor/admin only) Operational / In Workshop / Disabled counts
asset-detail           — role-adaptive: tech sees log first; field user sees attributes first
workshop-board         — supervisor/admin only: queue table with job status, assignment, priority
admin-users            — CRUD users
admin-assets           — register assets
admin-services         — manage service catalog
admin-locations        — manage site/sub-location list
admin-reports          — fleet health dashboard + audit log + export
```

---

## Key UX Rules (from persona analysis)

1. **Tech workflow target:** ≤ 60 seconds from login to completed log entry
2. **Touch targets:** min 48px on all interactive elements
3. **Tech detail page order:** Service Log section first, then Attributes
4. **No raw status dropdown for tech role** — status changes via workflow buttons only
5. **Flag requires reason** — mandatory text before submitting "Flag as Unserviceable"
6. **Location is always a dropdown** — no free typing; "Other" option appends custom text
7. **Disabled assets show downtime counter** — "Disabled for X days"
8. **Workshop board sorted by:** Priority (Urgent first), then Days In Shop (descending)
9. **My Jobs highlight** — on dashboard, jobs assigned to logged-in tech appear in a dedicated section above the full list

---

## Resolved Questions

| # | Decision |
|---|---|
| OQ-1 | Supervisors can log service entries. `logged_by_role` stored as "Supervisor" — visible in history. |
| OQ-2 | Downtime threshold: 5 days default. Stored in `app_settings`, editable by admin. |
| OQ-3 | "Other" custom locations auto-saved to `locations` table with `is_custom=1`. Shown under "Custom" in dropdown. Admin can promote or remove. |
| OQ-4 | Audit log export is separate from fleet status report. Two distinct endpoints/views. |
| OQ-5 | Per-job service log via `service_log.workshop_job_id`. Null = standalone. All entries roll up to asset history. |

---

## PRD
See: `fleet-prd.md` (same directory)
