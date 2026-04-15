# PRD: Strength Training Planner & Tracker (v1)
**Role:** Strength & Conditioning Coach / Product Manager
**Date:** 2026-04-14
**Status:** Approved

---

## 1. Product Vision

A low-friction, guided workout tracking app that manages progressive overload for a gym's trainees following a structured Push/Pull/Legs program. Trainees open the app, see exactly what to do today, log their sets, and close it. The system handles all progression logic automatically.

Primary outcome: every trainee makes measurable, visible strength progress — and can see it.

---

## 2. Users & Roles

| Role | Description | v1 |
|---|---|---|
| **Coach (Admin)** | Sets up the program, manages trainees, monitors progress | Yes |
| **Trainee** | Follows the program, logs sessions | Yes |
| **Gym Owner** | Manages coaches, billing, gym-wide settings | v2 |

> **v1 assumption:** One gym, one coach/admin account, unlimited trainees.
> **v2 todo:** Many gyms → many coaches → many trainees (multi-tenant hierarchy).

---

## 3. Training System Design

### 3.1 Program Structure
- **Split:** Push / Pull / Legs (PPL)
- **Frequency:** Twice per rotation — 6 training sessions per cycle
- **Cycle length:** 8 days (not a 7-day week)
- **Schedule:**

```
Day 1: Push A   (chest-dominant)
Day 2: Pull A   (vertical pull dominant)
Day 3: Legs A   (squat pattern dominant)
Day 4: REST
Day 5: Push B   (shoulder-dominant)
Day 6: Pull B   (horizontal pull dominant)
Day 7: Legs B   (hip hinge dominant)
Day 8: REST
────── cycle repeats ──────
```

> **Coach rationale:** The A/B variation prevents accommodation (Schoenfeld, 2010), ensures full muscle coverage across both push sessions, and distributes stimulus more evenly than a single push template repeated twice. The rest day after each Legs session is non-negotiable — systemic fatigue from compound lower body work requires it.

### 3.2 Session Templates (v1 — Hardcoded by Coach)

Each of the 6 sessions (Push A, Pull A, Legs A, Push B, Pull B, Legs B) is defined by the coach and contains:
- 4–6 exercises
- Per exercise: coach-assigned sets and rep range (low–high), starting weight, weight increment type, rest period, target RPE (coach-assigned, scale 1–10 — sets the intended exertion level for a given mesocycle, e.g. RPE 7 during accumulation, RPE 9 during intensification), actual RPE (logged subjectively by the trainee after each set), and up to 2 substitution options

### 3.3 Progressive Overload Model: RPE-Adjusted Double Progression

After each set, the trainee logs two subjective signals:
1. **Actual RPE** (1–10 scale)
2. **Set feeling** — one of three options: `Smooth` / `Hard but complete` / `Missed a rep`

At the end of a session, the app evaluates both signals together with the rep count to determine what changes next session of that type:

| Condition | Next session action |
|---|---|
| All sets hit **top** of rep range AND avg RPE ≤ target AND feeling mostly **Smooth** | **Increase weight** (add increment) |
| All sets hit **top** of rep range AND avg RPE > target OR feeling includes **Hard** | **Keep weight, continue pushing reps** — not ready to add load |
| Sets didn't reach top of range AND RPE ≤ target AND feeling **Smooth** | **Flag to coach** — starting weight may be set too low |
| Sets didn't reach top of range AND RPE at or above target | **No change** — keep working at current weight |
| 2+ sets below **bottom** of rep range across 2 consecutive sessions of that type | **Regression flag** → coach notified |

> **Rationale:** RPE alone can mislead — a trainee can hit 12 reps at RPE 9 (barely made it) or RPE 6 (had more in the tank). The feeling prompt catches what the number misses. Combining both gives a more accurate picture of readiness to progress, aligning with Galpin's work on autoregulation and Schoenfeld's volume-fatigue balance research.

**Weight increment rules (fixed, coach-editable per exercise):**
- Compound movements (Squat, Bench, Row, Deadlift, OHP): **+5 lbs**
- Isolation movements (Curl, Lateral Raise, Tricep Ext): **+2.5 lbs**

---

## 4. Feature List (v1 MVP)

### Trainee Features
- [ ] Register / Login
- [ ] View today's session (what day of the cycle am I on?)
- [ ] Guided session execution — set by set
  - See exercise name, target sets × rep range, target RPE, current working weight
  - Log actual reps per set (weight pre-filled, editable — trainee adjusts to hit target rep/RPE range)
  - After each set: log actual RPE (1–10) and set feeling (Smooth / Hard but complete / Missed a rep)
  - Built-in rest timer (coach-set suggested duration — advisory only; trainee starts next set when ready)
  - Swap to a pre-approved substitution (1 tap)
  - Notes field per exercise (optional)
- [ ] Mark session complete → Summary screen showing progression decisions (weight up / reps up / hold) per exercise
- [ ] Skip / reschedule session (logged as skipped, cycle continues)
- [ ] View session history (log of past sessions)
- [ ] Progress charts (per exercise: weight over time, volume over time, RPE trend over time)
- [ ] Upcoming session preview (what's next in the cycle)
- [ ] Onboarding: choose cycle starting session (any of Push / Pull / Legs; A session of chosen type is always first)

### Coach (Admin) Features
- [ ] Login to admin dashboard
- [ ] Program Builder
  - Create/edit 6 session templates (Push A/B, Pull A/B, Legs A/B)
  - Add exercises: name, sets, rep range, starting weight, increment type, rest timer
  - Add up to 2 substitutions per exercise
  - Mark each exercise as compound or isolation (auto-sets increment)
- [ ] Trainee Management
  - Add / remove trainees
  - Assign starting weights per trainee per exercise (or use program defaults)
  - Reset a trainee's cycle position
- [ ] Trainee Progress View
  - See any trainee's full log
  - See progression chart per exercise per trainee
  - View flagged regressions

### System Features
- [ ] Offline-first: all data reads/writes work without internet
- [ ] Background sync to cloud when connection is restored
- [ ] PWA: installable on Android and desktop browsers
- [ ] Push notifications (rest timer, next session reminder) — PWA supported

---

## 5. Screens & UX Flow

### 5.1 Trainee Flow

```
Login
  └── Dashboard
        ├── [TODAY] Session card → Active Session
        │     ├── Exercise 1 of N
        │     │     ├── Set 1: [reps] [weight] ✓
        │     │     ├── Set 2: [reps] [weight] ✓
        │     │     ├── Set 3: [reps] [weight] ✓
        │     │     ├── Rest Timer (auto-starts after each set)
        │     │     └── [Swap Exercise] → Substitution Picker
        │     ├── Exercise 2 of N ...
        │     └── [Complete Session] → Summary Screen
        │           └── Progression badges (🎯 if any weight increased)
        ├── History → Past Session List → Session Detail
        └── Progress → Exercise selector → Chart (weight/volume over time)
```

### 5.2 Dashboard Design Principles
- **One primary action:** "Start Today's Session" — large, impossible to miss
- Show: session name (e.g., "Push A — Chest Focus"), estimated duration, days since last session
- If rest day: show next session and countdown
- If session overdue: show gentle reminder, no guilt language
- Streak tracker (optional, configurable by coach — some athletes find streaks demotivating)

### 5.3 Active Session UX
- One exercise visible at a time (no scrolling through the full workout)
- Target RPE shown prominently alongside sets × rep range
- Sets shown as a horizontal row of circles — filled as logged
- Weight field is pre-filled with current working weight — trainee adjusts freely to hit target rep range and RPE
- After each set: quick post-set prompt appears — RPE slider (1–10) + feeling picker (Smooth / Hard but complete / Missed a rep); 2 taps max
- After logging post-set feedback → rest timer starts (coach-suggested duration shown as a countdown, advisory only)
- Trainee taps "Start Next Set" manually when ready — timer does not force advancement
- After last set of an exercise → auto-advance to next exercise
- "Back" available (low prominence) to re-log a previous set
- Emergency "End Session Early" — saves partial log, doesn't advance cycle

### 5.4 Coach Admin Screens

```
Admin Login
  └── Dashboard
        ├── Program Builder
        │     ├── Session List (Push A / Pull A / Legs A / Push B / Pull B / Legs B)
        │     └── Session Editor → Exercise List → Exercise Editor
        ├── Trainees
        │     ├── Trainee List → Trainee Profile
        │     │     ├── Assign starting weights
        │     │     ├── View full log
        │     │     ├── View progression charts
        │     │     └── Flagged regressions
        │     └── Add Trainee (email invite)
        └── Settings (gym name, coach profile)
```

---

## 6. Data Model (Logical)

```
Gym
  └── id, name, created_at

Coach
  └── id, gym_id, name, email

Program  (one per gym in v1)
  └── id, gym_id, name, version

Session  (6 per program: PushA, PullA, LegsA, PushB, PullB, LegsB)
  └── id, program_id, label, cycle_position (1-7, skipping 4 and 8)

Exercise
  └── id, session_id, name, sets, rep_min, rep_max, rest_seconds_suggested,
      target_rpe, increment_type (compound|isolation), display_order

Substitution
  └── id, exercise_id, name, notes

Trainee
  └── id, gym_id, name, email, cycle_day (1–8), program_id,
      cycle_start_session (push|pull|legs — chosen at onboarding)

TraineeExerciseState  (working weight + progression tracking per trainee per exercise)
  └── trainee_id, exercise_id, current_weight, consecutive_top_sessions,
      last_progression_type (weight|reps|hold), flagged

WorkoutLog
  └── id, trainee_id, session_id, date, completed (bool), duration_minutes

SetLog
  └── id, workout_log_id, exercise_id, set_number, weight, reps,
      rpe_actual, set_feeling (smooth|hard|missed), substitution_used (bool)
```

---

## 7. Offline-First Architecture

**Storage:** IndexedDB (via a library like Dexie.js) — all reads/writes go local first.

**Sync strategy:**
- On write: save locally → push to cloud queue
- On connectivity restore: drain queue → sync to Firestore
- On conflict: last-write-wins for set logs (rare conflict scenario); coach program data always pulled from server on login

**Backend: Firebase Firestore** (confirmed for v1)
- Offline SDK built-in (handles queue and sync automatically)
- Auth included
- Real-time updates for coach dashboard (see trainees logging live)
- PWA-friendly

**Service Worker:** Cache app shell for full offline functionality. Notification API for rest timer and session reminders.

---

## 8. v1 Constraints & Explicit Non-Goals

| Out of scope for v1 | Notes |
|---|---|
| Multiple programs per gym | One hardcoded program per gym |
| Multiple coaches | One admin per gym |
| Custom exercise creation by trainee | Coach-only |
| Periodization phases (deload weeks) | Manual coach intervention only |
| Body weight / cardio tracking | Future |
| Nutrition tracking | Future |
| Video demos for exercises | Nice-to-have, deferred |
| Apple iOS App Store listing | PWA only |
| Play Store listing | PWA only (v1) |

---

## 9. Resolved Design Decisions

1. **Backend:** Firebase Firestore confirmed for v1. See v2 roadmap for re-evaluation.
2. **Starting weights:** Coach sets program-level defaults. Trainee can freely adjust weight during any session to hit their target rep range and RPE — the system tracks their actual working weight from that point forward.
3. **Onboarding:** Trainee starts on Day 1 of the cycle and chooses which session type to begin with (Push, Pull, or Legs). The A/B pattern and rest days follow from that choice. E.g., starting with Legs gives: Legs A → Pull A → Push A → REST → Legs B → Pull B → Push B → REST.
4. **Rest timer:** Advisory only. Timer shows the coach-suggested rest duration and counts down, but the trainee manually taps "Start Next Set" when ready. App never auto-advances to the next set.
5. **Post-set feedback + progression:** After each set, trainee logs RPE (1–10) and set feeling (Smooth / Hard but complete / Missed a rep). Both are used by the progression engine (see Section 3.3) to decide whether the next session increases weight, pushes reps, or holds. Session summary screen shows the progression decision per exercise.

---

## 10. v2 Roadmap (Todos)

- [ ] Multi-coach / multi-gym support (many coaches → many trainees)
- [ ] Multiple programs per gym (beginner vs. intermediate templates)
- [ ] Periodization: auto-programmed deload every 4th cycle
- [ ] Warm-up set calculator (% of working weight)
- [ ] Coach messaging / notes to trainee per session
- [ ] Play Store / App Store distribution (React Native port or TWA wrapper)
- [ ] Body composition tracking (weight, photos — optional)
- [ ] 1RM estimator (Epley formula from top-set data)
- [ ] AI-assisted weight suggestion on plateau
- [ ] Re-evaluate backend (Supabase, PlanetScale, custom Node API) — Firebase works for v1 but evaluate cost/control tradeoffs at scale

---

## 11. Technical Stack (Recommendation)

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Vanilla JS + HTML/CSS or lightweight framework (Preact) | Consistent with existing repo style; fast, no build toolchain needed for v1 |
| Local storage | Dexie.js (IndexedDB wrapper) | Clean API, excellent offline support |
| Backend / DB | Firebase Firestore | Offline SDK, Auth, real-time, no server to manage |
| Auth | Firebase Auth (email/password) | Simplest for gym context |
| Hosting | Firebase Hosting | Free tier, CDN, HTTPS, PWA-ready |
| Service Worker | Workbox | Google-maintained, integrates with Firebase |

---

## 12. Success Metrics (v1)

- **Session completion rate:** % of scheduled sessions logged (target: >80% per active trainee)
- **Progression rate:** % of exercises showing weight increase over 4-week period
- **Session log time:** Time from "Start Session" to "Complete" should reflect actual workout time (validates low-friction logging)
- **Regression flags:** Track how often regressions are flagged (high rate = program too aggressive or weights set wrong)
