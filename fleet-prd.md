# Fleet Asset Manager — Product Requirements Document (PRD)

**Version:** 1.1  
**Status:** Approved for development  
**Last updated:** 2026-03-30  
**Audience:** Development team, QA/testing team

---

## 1. Product Overview

Fleet Asset Manager is a web-based internal tool that allows operations teams to track the real-time status, location, and maintenance history of a company's heavy equipment and vehicle fleet. It is accessed from a PC (admin/supervisor) and from iPads or tablets in the field and workshop (technicians and users).

The application runs as a local Node.js server on a company PC and is accessible to all devices on the same network. Data is stored in a SQLite database on the server — all devices share the same live data.

---

## 2. User Roles

| Role | Description | Primary Device |
|---|---|---|
| **admin** | Full system access. Manages users, assets, service catalog, locations, and app settings. | PC |
| **supervisor** | Manages workshop operations. Intakes assets, assigns techs, releases jobs. Logs services. Views fleet health. | PC / Tablet |
| **tech** | Logs services, flags unserviceable assets, manages assigned workshop jobs. | iPad / Tablet |
| **user** | Regular field employee. Updates asset location and deployment status. | iPad / Tablet |

Default login on first run: `admin` / `admin123`

---

## 3. Feature Specifications

### 3.1 Authentication

- Login with username and password
- JWT token stored client-side, valid for 24 hours
- Automatic redirect to login when token is missing or expired
- Logout clears token and returns to login screen
- All API calls include `Authorization: Bearer <token>` header

**Acceptance criteria:**
- Valid credentials → dashboard
- Invalid credentials → error message, no redirect
- Expired/missing token on any protected view → redirect to login
- Logging out as any role → login screen, back button does not re-enter the app

---

### 3.2 Asset Dashboard

All authenticated users see a list of all registered assets.

**All roles:**
- Search/filter bar at top — filters by serial number or description in real time
- Each card shows: Serial/VIN, Description, Location, Status badge (color-coded), days disabled if applicable
- Tap/click a card → Asset Detail view

**Tech role additionally sees:**
- "My Jobs" section above the asset list — shows only assets with workshop jobs assigned to the logged-in tech

**Supervisor / Admin additionally sees:**
- Fleet summary bar at top: `Operational: X | In Workshop: X | Disabled: X | Flagged: X`

**Status badge colors:**
- Onsite → green
- Deployed → amber
- Disabled → red
- Flagged → orange (flagged as unserviceable, awaiting workshop intake)

---

### 3.3 Asset Detail View

The detail view adapts based on the logged-in user's role.

#### 3.3.1 All Roles — Attributes Section

- **Location** — dropdown of predefined locations. Includes "Other (specify)" option that reveals a text input. Cannot be blank when status is Deployed. Custom values entered via "Other" are saved automatically for future use (appear in the dropdown as user-contributed entries, visually distinguished from admin-managed entries).
- **Status** — `user` role can set Onsite or Deployed only. Tech/supervisor/admin status is controlled by workflow buttons.
- **Save Changes** — saves location and allowed status changes. Writes audit log entry.
- **Service History** — full timestamped log of all services performed on this asset, visible to all roles. Each entry shows: service name, logged by (name + role), timestamp, notes.

#### 3.3.2 Tech Role — Additional Capabilities

- **Service Log section appears ABOVE the Attributes section** (tech's primary action)
- **Log a Service:**
  - Searchable dropdown populated from active service catalog
  - Optional notes field
  - "Log Service" button — saves entry with timestamp, tech's name, and role
  - Entry appears immediately in Service History
- **Flag as Unserviceable:**
  - Requires a mandatory reason (text field — cannot be blank)
  - Creates a workshop job with status "Flagged"
  - Asset badge changes to orange "Flagged"
  - Asset status does NOT change to Disabled until supervisor formally intakes it
- **Tech cannot:** change status via dropdown, intake to workshop, release from workshop

#### 3.3.3 Supervisor / Admin — Additional Capabilities

- All tech capabilities, including logging service entries
- Service log entries made by supervisors show their display name and "Supervisor" role label
- **Intake to Workshop:** Available on any asset, especially Flagged ones. Requires assigning a tech, setting priority (Urgent / Normal / Scheduled). On confirm: creates/updates workshop job (status → Waiting), sets asset status to Disabled, sets location to selected workshop sub-location.
- **Release from Workshop:** Only available when job status is "Ready for Release." On confirm: closes job, sets asset status to Onsite, prompts for new location.
- **Downtime indicator:** If asset has been Disabled for more than the configured threshold (default 5 days, configurable by admin), show: "⚠ Disabled for X days"

---

### 3.4 Workshop Board (Supervisor / Admin Only)

A dedicated view showing all active workshop jobs.

**Columns:** Asset Serial, Description, Assigned Tech, Job Status, Priority, Days In Shop, Parts/Notes, Actions

**Job statuses (supervisor sets):**
- `Flagged` — reported by tech, awaiting formal intake
- `Waiting` — intaked, not yet started
- `In Progress` — tech actively working
- `Awaiting Parts` — blocked on parts
- `Ready for Release` — work complete, pending supervisor sign-off

**Priority:** `Urgent` | `Normal` | `Scheduled`

**Sorting:** Urgent first, then by Days In Shop descending.

**Per-job Service Log:**
Each workshop job has its own service log, separate from the global asset service history. Supervisors and techs can log service entries directly against the job. These entries:
- Appear in the job's detail panel on the workshop board
- Also roll up into the asset's overall service history (tagged with the job reference)
- Show the logger's name and role (Tech or Supervisor)

**Actions per job:**
- Update job status
- Change assigned tech
- Add/edit parts notes
- Log a service entry against this job
- Release asset (when status is Ready for Release)

**Technician workload panel:** Shows each tech and their active job count.

---

### 3.5 Admin: User Management

- List all users (username, display name, role)
- Add / edit / delete users
- Cannot delete own account or last admin
- Passwords stored as hash

---

### 3.6 Admin: Asset Registration

- Register new asset: Serial/VIN (unique, case-insensitive), Description
- List all registered assets with current status and location
- New asset seeded with status: Onsite, no location

---

### 3.7 Admin: Service Catalog

- Add / remove (soft-delete) / restore services
- Removed services no longer appear in service log dropdown
- Existing log entries retain service name regardless of deactivation

---

### 3.8 Admin: Location Management

- Admin-managed list of sites + sub-locations (e.g. "North Site — Workshop")
- Add / deactivate locations
- User-contributed custom locations (entered via "Other" field) appear in a separate section of the dropdown marked as "Custom." Admin can promote them to official or deactivate them.
- Pre-loaded with 5 sites × 4 sub-locations on first run:

| Site | Sub-locations |
|---|---|
| Main Depot | Workshop, Storage Yard, Parking Bay, Fueling Station |
| North Site | Workshop, Laydown Area, Site Entrance, Fuel Point |
| South Site | Workshop, Equipment Park, Materials Storage, Guard Post |
| East Yard | Workshop, Heavy Equipment Bay, Parts Store, Wash Bay |
| West Compound | Workshop, Open Yard, Container Storage, Office Park |

---

### 3.9 Admin: App Settings

Admin-configurable system settings stored in the database:

| Setting | Default | Description |
|---|---|---|
| `downtime_warning_days` | 5 | Days before a Disabled asset triggers the ⚠ warning |

Settings are editable via the Admin panel and take effect immediately.

---

### 3.10 Fleet Health Dashboard (Supervisor / Admin)

- Summary counts: Total Assets, Operational, In Workshop, Disabled, Flagged
- Assets disabled longer than `downtime_warning_days` — listed with day count
- Assets with no service logged in 90 days — maintenance compliance list
- Audit log: chronological feed of all state changes, service entries, and user actions. Shows user name, role, timestamp, action.
- **Audit log export:** Separate CSV/print export, independent of the fleet status report
- **Fleet status export:** Printable summary of all assets with current state (separate from audit export)

---

## 4. Non-Functional Requirements

| Requirement | Specification |
|---|---|
| Platform | Windows 11 host, Node.js 20 LTS. Client: any modern browser (Chrome/Safari on iPad). |
| LAN access | Server binds to `0.0.0.0:3000`. Accessible at `http://[HOST-IP]:3000` on same network. |
| Startup | Double-click `start.bat` → server running. `npm install` required once after download. |
| Touch targets | Minimum 48×48px for all interactive elements in tablet-facing views. |
| Response time | All API responses < 300ms on local network. |
| Data integrity | All writes confirmed before UI updates. Failed writes show error toast. |
| Audit trail | Every state change and service entry writes to `audit_log` with user, role, timestamp, details. |
| Security | JWT required on all API routes except login. Role enforced server-side on every request. |

---

## 5. Data Model Summary

```
users          (id, username, password_hash, display_name, role, created_at)
assets         (id, serial, description, registered_by, registered_at)
asset_states   (id, asset_id, location_id, custom_location, status,
                flagged, flag_reason, last_updated_by, last_updated_at)
workshop_jobs  (id, asset_id, assigned_tech_id, job_status, priority,
                parts_notes, flagged_by, intake_by, intake_at,
                released_by, released_at)
service_log    (id, asset_id, workshop_job_id [nullable], service_id,
                service_name, logged_by_id, logged_by_name, logged_by_role,
                timestamp, notes)
services       (id, name, active, created_at)
locations      (id, site_name, sub_location, is_custom, active)
app_settings   (key, value, updated_by, updated_at)
audit_log      (id, user_id, user_name, user_role, action, entity_type,
                entity_id, details_json, timestamp)
```

Key design notes:
- `service_log.workshop_job_id` is nullable. When set, the entry is job-scoped; it still appears in the asset's full history.
- `service_log.logged_by_role` is denormalized so the label (Tech / Supervisor) is preserved if the user's role changes later.
- `locations.is_custom` distinguishes admin-managed from user-contributed entries.
- `app_settings` is a simple key-value table for configurable thresholds.

---

## 6. Seed Data (First Run)

- 1 default admin: `admin` / `admin123`
- 20 service catalog entries
- 20 predefined locations (5 sites × 4 sub-locations)
- 20 sample assets (5 excavators, 5 light vehicles, 5 bulldozers, 5 cranes)
- App settings: `downtime_warning_days = 5`

---

## 7. Test Scenarios

> **Instructions for testers:** Each scenario specifies the role, steps, and expected outcome. Run scenarios in order within each group — some depend on prior state. Run the full suite after any code change.

---

### GROUP A — Authentication

**A-01: Valid login**
- Role: admin / admin123
- Steps: Open app → enter credentials → Sign In
- Expected: Dashboard loads. Header shows "Administrator" and "Admin" chip.

**A-02: Invalid login**
- Steps: Enter wrong password → Sign In
- Expected: Error message. No redirect.

**A-03: Session persistence**
- Steps: Log in → close browser tab → reopen app URL
- Expected: Dashboard loads without re-login.

**A-04: Logout**
- Steps: Click Logout
- Expected: Login screen. Back button does not re-enter app.

**A-05: Expired token**
- Steps: Log in → open DevTools → delete JWT from localStorage → navigate to any view
- Expected: Redirect to login.

---

### GROUP B — Asset Dashboard

**B-01: All roles see asset list**
- Role: user, tech, supervisor (test each)
- Expected: All 20 sample assets listed with serial, description, location, and status badge.

**B-02: Search filters in real time**
- Role: any
- Steps: Type "CAT" in search bar
- Expected: List narrows to assets matching "CAT" in serial or description only.

**B-03: Search clears correctly**
- Steps: Type "CAT" → clear the field
- Expected: Full asset list returns.

**B-04: Fleet summary visible only to supervisor/admin**
- Role: supervisor → confirm visible. user → confirm absent. tech → confirm absent.
- Expected: Summary bar (Operational / In Workshop / Disabled / Flagged) only for supervisor and admin.

**B-05: My Jobs section (tech)**
- Pre-condition: A workshop job must be assigned to this tech (run after D-03 + E-02)
- Role: tech
- Expected: "My Jobs" section appears above main list showing the assigned asset.

**B-06: Flagged asset shows orange badge**
- Pre-condition: An asset has been flagged (run after D-03)
- Expected: Asset card shows orange "Flagged" badge.

---

### GROUP C — Asset Detail: All Roles

**C-01: Location dropdown shows predefined locations**
- Role: any
- Steps: Open any asset → click Location dropdown
- Expected: 20 predefined locations shown, grouped by site name.

**C-02: "Other" option reveals text input**
- Steps: Select "Other (specify)" from location dropdown
- Expected: A text input appears. User can type a custom location.

**C-03: Custom location is saved and reappears**
- Steps: Enter "Remote Drill Site 7" → save → open a different asset → open location dropdown
- Expected: "Remote Drill Site 7" appears in a "Custom" section of the dropdown.

**C-04: Save location change**
- Role: user
- Steps: Select "Main Depot — Storage Yard" → Save Changes
- Expected: Toast confirms. Dashboard card shows updated location.

**C-05: Deployed requires location**
- Role: user
- Steps: Set Status to Deployed → clear location → Save Changes
- Expected: Error "Location is required when deploying." Save blocked.

**C-06: Service history shows logger name and role**
- Pre-condition: At least one service entry logged by a tech and one by a supervisor
- Role: any
- Expected: Each history entry shows service name, logged by "[Name] (Technician)" or "[Name] (Supervisor)", timestamp, notes.

**C-07: Service history visible to all roles**
- Role: user
- Expected: Service History section present and readable. No log/flag action buttons visible.

---

### GROUP D — Tech Workflows

**D-01: Service log section is first**
- Role: tech
- Steps: Open any asset detail
- Expected: "Log a Service" section appears above the Attributes section.

**D-02: Log a service entry**
- Role: tech
- Steps: Type "oil" → select "Oil & Filter Change" → click Log Service
- Expected: Entry immediately appears in Service History with tech's name, "Technician" label, and current timestamp.

**D-03: Log service requires selection**
- Steps: Click Log Service without selecting
- Expected: Toast error "Please select a service first."

**D-04: Flag as Unserviceable — reason required**
- Role: tech
- Steps: Open "CAT320-001" → click "Flag as Unserviceable" → leave reason blank → submit
- Expected: Error — reason is mandatory. No flag created.

**D-05: Flag as Unserviceable — success**
- Steps: Enter reason "Hydraulic leak detected" → submit
- Expected: Dashboard badge for CAT320-001 → orange "Flagged". Asset status still NOT Disabled.

**D-06: Tech has no status dropdown**
- Role: tech
- Steps: Open any asset detail
- Expected: No Status dropdown visible. Status shown as read-only.

**D-07: Tech cannot intake or release**
- Role: tech
- Expected: No "Intake to Workshop" or "Release from Workshop" buttons visible anywhere.

---

### GROUP E — Supervisor Workflows

**E-01: Workshop board accessible**
- Role: supervisor
- Steps: Navigate to Workshop Board
- Expected: Table loads. CAT320-001 appears with status "Flagged."

**E-02: Intake flagged asset**
- Steps: Find CAT320-001 → Intake → assign tech1 → set priority Urgent → confirm
- Expected: Job status → "Waiting." Asset status → Disabled. Location → a workshop sub-location. tech1 sees job in "My Jobs."

**E-03: Update job status to In Progress**
- Steps: Change CAT320-001 job status to "In Progress"
- Expected: Status updates on workshop board. Audit log records change.

**E-04: Log service entry against workshop job**
- Role: supervisor
- Steps: On the workshop board job panel for CAT320-001 → log "Hydraulic Oil & Filter Change" with note "replaced main cylinder hose"
- Expected: Entry appears in job's service log. Entry also appears in CAT320-001's asset service history tagged with job reference. Entry shows supervisor's name and "Supervisor" role label.

**E-05: Set job to Awaiting Parts**
- Steps: Change status to "Awaiting Parts" → enter "Waiting for hydraulic hose, ETA 2 days" in parts notes
- Expected: Status and notes saved and visible on workshop board.

**E-06: Mark Ready for Release**
- Steps: Change status to "Ready for Release"
- Expected: "Release Asset" button becomes active.

**E-07: Release asset**
- Steps: Click "Release Asset" → confirm → select location "Main Depot — Parking Bay"
- Expected: Job closed. Asset status → Onsite. Location → "Main Depot — Parking Bay." tech1's "My Jobs" clears. Audit log entry created.

**E-08: Downtime warning threshold**
- Pre-condition: An asset has been Disabled for more than 5 days (modify `last_updated_at` in DB directly for testing, or change `downtime_warning_days` setting to 0 temporarily)
- Role: supervisor or admin
- Expected: Asset detail and fleet dashboard show "⚠ Disabled for X days" warning.

**E-09: Technician workload panel**
- Role: supervisor
- Expected: Workshop board shows each tech with their active job count. Assigning a new job to a tech increments their count.

**E-10: Supervisor can log service on asset detail (not just workshop board)**
- Role: supervisor
- Steps: Open any asset's detail view → log a service entry
- Expected: Entry saved with supervisor's name and "Supervisor" role label. Appears in service history.

---

### GROUP F — Admin Workflows

**F-01: Create one user per role**
- Steps: Admin → Users → add supervisor1/pass123/Supervisor, tech1/pass123/Technician, user1/pass123/User
- Expected: All three appear in list with correct roles. Can log in.

**F-02: Edit user — password unchanged if left blank**
- Steps: Edit tech1 → change display name to "John Smith" → leave password blank → save
- Expected: Display name updated. tech1 logs in with original password.

**F-03: Cannot delete last admin**
- Steps: Try to delete the only admin account
- Expected: Error "Cannot delete the last admin account."

**F-04: Cannot delete own account**
- Steps: Logged in as admin → try to delete own account
- Expected: Delete button disabled or error shown.

**F-05: Register new asset**
- Steps: Admin → Assets → Register: Serial "TEST-001" / "Test Asset Unit 1"
- Expected: Appears on dashboard with status Onsite, no location.

**F-06: Duplicate serial blocked**
- Steps: Register another asset with serial "test-001" (lowercase)
- Expected: Error "Serial/VIN already registered." (case-insensitive check)

**F-07: Add service to catalog**
- Steps: Admin → Services → add "Hydraulic Hose Replacement"
- Expected: Appears in active list. Visible in tech's service dropdown.

**F-08: Remove service — log entries preserved**
- Pre-condition: "Oil & Filter Change" logged at least once (after D-02)
- Steps: Admin → Services → Remove "Oil & Filter Change"
- Expected: Gone from service dropdown. Existing log entry still shows "Oil & Filter Change" in asset history.

**F-09: Add location**
- Steps: Admin → Locations → Add site "Port Facility" / sub-location "Quay Storage"
- Expected: "Port Facility — Quay Storage" appears in location dropdown.

**F-10: Promote custom location to official**
- Pre-condition: A custom location was saved by a user (after C-03)
- Steps: Admin → Locations → find "Remote Drill Site 7" in Custom section → promote to official
- Expected: Moves from "Custom" to main location list. No longer visually distinguished.

**F-11: Configure downtime warning threshold**
- Steps: Admin → Settings → change `downtime_warning_days` to 10 → save
- Expected: Fleet dashboard and asset detail now use 10 days as the threshold.

**F-12: Fleet health dashboard — counts are accurate**
- Role: admin or supervisor
- Steps: Navigate to Reports → Fleet Dashboard
- Expected: Operational, In Workshop, Disabled, Flagged counts match known asset states.

**F-13: Maintenance compliance list**
- Expected: Assets with no service logged in 90 days appear in compliance section.

**F-14: Audit log export (separate from fleet report)**
- Steps: Reports → Audit Log → Export
- Expected: CSV or print view of audit log entries only. Does not include fleet status.

**F-15: Fleet status export (separate from audit log)**
- Steps: Reports → Fleet Status → Export
- Expected: Printable/CSV view of all assets with current state. Does not include audit log.

---

### GROUP G — Role Isolation (Security)

**G-01: Tech cannot access admin views**
- Role: tech → navigate to `/admin/users`
- Expected: Redirect to dashboard.

**G-02: User cannot access workshop board**
- Role: user → navigate to `/workshop`
- Expected: Redirect to dashboard.

**G-03: Tech has no fleet summary bar**
- Role: tech
- Expected: No Operational/In Workshop/Disabled/Flagged summary visible.

**G-04: API role enforcement — server side**
- Steps: Log in as tech → copy JWT → call `POST /api/assets` with tech's JWT via DevTools fetch
- Expected: HTTP 403 Forbidden. No asset created.

**G-05: Unauthenticated API call blocked**
- Steps: Call any `/api/` route with no Authorization header
- Expected: HTTP 401 Unauthorized.

**G-06: Supervisor cannot access admin user management**
- Role: supervisor → navigate to admin user management
- Expected: Redirect to dashboard.

---

### GROUP H — Data Integrity

**H-01: Data persists across page reload**
- Steps: Log a service → refresh page → open same asset
- Expected: Service entry present in history.

**H-02: Data shared across devices (LAN)**
- Pre-condition: Two devices on same network
- Steps: On PC (admin), register "LAN-TEST-001". On iPad (user), refresh dashboard.
- Expected: "LAN-TEST-001" visible on iPad immediately.

**H-03: Workshop job service log rolls up to asset history**
- Pre-condition: A service was logged against a workshop job (after E-04)
- Steps: Open that asset's detail view → scroll to Service History
- Expected: The job-logged entry appears, tagged with the workshop job reference.

**H-04: Server restart — data retained**
- Steps: Create user + asset → stop server → restart → log in
- Expected: User and asset still exist. SQLite file persisted.

**H-05: Custom location persists across sessions**
- Pre-condition: Custom location "Remote Drill Site 7" was saved (after C-03)
- Steps: Log out → log back in → open any asset → location dropdown
- Expected: "Remote Drill Site 7" still present in Custom section.

---

### GROUP I — Deployment

**I-01: Fresh install on Windows**
- Steps: On a clean Windows 11 machine with Node.js 20 installed, place project folder, double-click `start.bat`
- Expected: `npm install` runs automatically, server starts, `http://localhost:3000` shows login screen, admin/admin123 works.

**I-02: LAN access from tablet**
- Steps: Find host PC's local IP → open `http://[PC-IP]:3000` on iPad (same Wi-Fi)
- Expected: Login screen loads. Full app functional. Data matches PC.

**I-03: Windows Firewall prompt**
- Steps: First time running `start.bat` on a machine where Node.js hasn't run a server before
- Expected: Windows Firewall dialog appears. Allowing access for private networks enables LAN access from tablets.

---

## 8. Open Questions

All resolved. See decisions below.

| # | Question | Decision |
|---|---|---|
| OQ-1 | Can supervisors log service entries? | Yes. Log shows their name and "Supervisor" role label. |
| OQ-2 | Downtime warning threshold? | 5 days default, configurable by admin in App Settings. |
| OQ-3 | Save "Other" custom locations? | Yes — auto-saved, reappear in dropdown under "Custom" section. Admin can promote or remove. |
| OQ-4 | Audit log export? | Separate export from fleet status report. |
| OQ-5 | Per-job service log? | Yes — workshop jobs have their own service log. Entries also roll up to asset history. |

---

## 9. Out of Scope (v1)

- Push notifications or email alerts
- Offline mode / sync
- File/photo attachments
- Multi-company / multi-tenant
- Custom role creation
- Asset retirement / archival
- Scheduled maintenance reminders
- Native mobile app
