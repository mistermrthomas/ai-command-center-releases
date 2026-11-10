# v0.16.0 — optional Claude critique

Classification: owner-requested feature. Agent: Cursor Grok.
Approval reference: owner-claude-critique-2026-11-10.

- Add an explicit public-safe opt-in for Claude as the independent critique on new discussions. Each round can include one cited web-search review after Muse and before Grok, up to three rounds. Existing discussions and unchecked submissions keep their approved workflow.
- Read ANTHROPIC_API_KEY from the environment only. Use Claude Haiku 5.5 with one direct web search. Save HTTPS source links and do not store encrypted search blobs, prompts, or keys.
- Accept the OpenAI credential from either OPENAI_API_KEY or the existing OPEN_AI_KEY service variable. The service variable name is left unchanged.
- If the key is missing, mark Claude unavailable, skip that critique, and continue the discussion. A failed or uncertain paid attempt is not retried, and any reservation is retained.
- Count Claude with Gemini and the Overseer against the $0.25 discussion API budget and the existing monthly API guard. The reservation includes token estimates plus one $0.01 web search. Estimates are not a provider billing cap.
- Send expired administrator sessions to the login page, including a browser navigation that would otherwise show the JSON "Admin login required" body. After sign-in, return only to this app's home or the same saved discussion. A bad password redisplays the password form.
- Preserve the SQLite schema, history, credentials, and native Muse/Grok identities.

# v0.15.1 — recover expired hosted sessions

Classification: routine reversible bug fix requested by owner. Agent: Codex.
Approval reference: owner-development-updates-2026-11-09.

- Redirect every expired administrator API session to the existing login page,
  including background polling, before trying to parse the unauthorized body.
- Retain only the selected opaque discussion ID in tab session storage and reopen
  that saved discussion after login. No task text or credential is stored there.
  Running assignments and saved progress remain on the server; no task is replayed.
- Keep authentication, cookie expiry, database schema and agent routes unchanged.
- Record only a safe Gemini HTTP/failure category when a provider check is held;
  never expose provider bodies, prompts or keys, and retain the no-retry guard.
- Verify 148 Python tests, JavaScript syntax and four JavaScript checks including
  concurrent unauthorized requests, storage-disabled login and regular API errors.

# v0.15.0 — optional grounded Gemini collaboration

Classification: owner-requested feature. Agent: Codex.
Approval reference: owner-gemini-grounding-2026-11-10.

- Add explicit public-safe Gemini opt-in for new discussions, with one Google
  Search grounded check per round before native Muse and Grok, up to three rounds.
  Existing discussions and unchecked submissions keep their approved workflow.
- Read GEMINI_API_KEY from the environment only. Use Gemini 2.5 Flash-Lite with
  Google Search, HTTPS-only source links and sandboxed search attribution.
- Reserve each paid attempt before dispatch; count Gemini and Overseer against
  a $0.25 discussion API budget and the existing monthly API guard. Include a
  conservative $0.035 search estimate plus token usage; estimates are not provider
  billing caps. Never automatically retry an uncertain paid attempt.
- Preserve SQLite schema, history, credentials and native Muse/Grok identities.
  Missing keys pause the optional Gemini step; private-looking payloads require
  review. Public-safe consent and local screening are not a complete PII firewall.
- Verification: 147 Python tests, JavaScript syntax and three JavaScript checks.
  Coverage includes all three rounds, exact payload binding, budget reservations,
  key/timeout/restart holds, source rendering and unchanged two-agent behavior.
  Live provider verification requires a separately supplied Gemini API key.

# v0.14.0 — optional authenticated hosting

- Add opt-in single-port hosted UI and agent gateway, ACC_HOST and PORT support.
- Require an HTTPS origin and administrator password for public UI binding;
  add expiring server-side sessions, secure cookies, login throttling and origin checks.
- Preserve local two-port behavior, fixed-identity agent authentication, SQLite
  schema, task scopes, budgets and dialogue behavior. No deployment or data transfer.
- Verify all 117 existing Python tests, 12 new hosting tests (including synthetic
  process restart/volume persistence), JavaScript syntax and three JS checks.
- Publish sanitized runtime files only through the existing signed pipeline.

## v0.13.0 — Bounded three-turn dialogue — 2026-11-09

Classification: explicitly owner-approved major workflow change. Agent: Codex.
Approval reference: owner-three-turn-dialogue-2026-11-09.

- New submissions explicitly approve up to three turns each for native Muse and
  Grok, then one OpenAI Overseer recommendation. Existing discussions and old
  clients retain their original one-pass scope; refresh the UI for the new policy.
- Each agent responds to its counterpart's latest handoff and its own prior
  position. Stop after two exchanges only when both explicitly report resolved
  issues; otherwise stop at the third pair. Model text cannot increase the cap.
- Preserve bounded open issues in handoffs and show them in chat. The Overseer
  receives every completed compact turn without truncation and must weigh reasons,
  rejected objections, uncertainty and remaining disagreement rather than favoring
  the latest answer. Agreement is not treated as independently verified truth.
- Keep the existing monthly API/Grok limits. Reserve each Grok attempt before its
  webhook; no automatic retries or per-step approval prompts within task scope.
  Muse native usage remains outside the app's meter. No new provider or schedule.
- Rearm the public boolean signal for each new Muse assignment ID, with durable
  per-turn fetch claims. Refresh a stale false cache when a new turn is queued.
  Show round labels, evidence-backed reply links, and a stalled-fetch warning.
- Preserve SQLite schema/history and credentials. Updater rollback to older code
  holds active new-format tasks in read-only maintenance rather than replaying or
  misinterpreting them. Incurred spending is never rewound.
- Verification: 117 isolated Python tests and three JavaScript checks passed,
  including full three-round HTTP callback simulation, early stop, duplicate/
  restart behavior, budgets, private handoff pauses, legacy scope and rollback.
  No live AI calls for testing. Native hook reliability still needs a live test.

## v0.12.1 — Readable agent chat — 2026-11-09

Classification: owner-requested minor presentation correction. Agent: Codex.

- Present distinct Muse, Grok and Overseer chat bubbles, keeping newest replies at
  the top. Show the readable handoff text rather than its JSON transport wrapper.
- Format headings, paragraphs, emphasis and lists using safe text nodes, never
  untrusted HTML. Preserve the exact original response/source in collapsed details.
- Show links to the agent inputs a reply actually used, derived from saved bound
  payloads and authenticated/API message provenance, not from an agent's claims.
- Collapse technical workflow/activity details so the chat is prominent. Improve
  connection-button contrast and show the running version instead of a stale badge.
- No additional agent turns, provider calls, permissions, schema or stored-message
  changes. Existing one-proposal/critique/synthesis limits remain unchanged.
- Verification: 100 isolated Python tests; JavaScript chat safety, submission and
  payload-binding checks; browser visual review with synthetic data. No live AI calls.

## v0.12.0 — Public Muse wake signal — 2026-11-09

Classification: explicitly owner-approved security/privacy change. Agent: Codex.
Approval reference: owner-muse-work-signal-2026-11-09.

- Add unauthenticated GET /muse/work-available on the agent gateway only. It returns
  exactly one boolean: whether approved sequential Muse work needs a first fetch.
  No assignment IDs, counts, titles, prompts, credentials or conversation data.
- Public reads never consume work, invoke an agent, reserve spending or modify the
  queue. Legacy tasks, held work and completed work do not raise the signal.
- An authenticated Muse assignment fetch durably suppresses that task's signal.
  Grok and unauthenticated callers cannot claim it. The authenticated assignment
  remains fetchable and callbacks remain idempotent; no automatic claim expiry or
  retry. A small in-process cache bounds repeated unauthenticated disk work.
- Maintenance and storage failures return a generic unavailable response. All
  assignment/message/admin access restrictions remain in place.
- Native Muse hook configuration is not enabled by this release. It still needs
  local debounce/in-flight control and one unattended fetch/reply test. An app
  spending guard cannot meter or cap usage inside Muse's native runtime.
- Verification: 99 isolated Python tests passed, including HTTP signal scoping,
  non-disclosure, read-only behavior, authenticated-only suppression and restart
  persistence. Existing JavaScript checks passed. No AI calls or migrations.

## v0.11.1 — Submit-to-start sequential collaboration — 2026-11-09

Classification: owner-approved major workflow change. Responsible agent: Codex.
Approval reference: owner-submit-workflow-2026-11-09.

- Submitting a discussion starts one persistent Muse → Grok → OpenAI Overseer
  sequence; title is optional. Existing discussions start only on explicit action.
- Grok receives a bounded task-specific Muse handoff; the Overseer receives both
  agents’ handoffs. Unrelated history/files are excluded. User-approved task sharing
  covers these normal steps under existing monthly limits, not external actions.
- Unsupported/oversized handoffs or suspected sensitive content pause for editable
  exact review. Pattern checks are conservative heuristics, not complete PII detection.
- Persist phases, payload hashes, approvals and outbound manifests locally. Duplicate
  submissions/callbacks do not repeat calls; uncertain dispatches and synthesis are
  not retried. Preserve SQLite schema, history, credentials and native bot identities.
- Show progress, clear blockers and completion notifications. Saved Grok setup is
  labeled as settings rather than repeatedly requesting connection.
- Add a password-only local Overseer key form; preserve other configuration and never
  echo the key. Save connection settings in the persistent state directory, not the
  replaceable signed release directory.
- Automatic Muse wake-up remains unavailable. The app queues its assignment and
  waits honestly; a callback resumes the sequence. The Overseer also requires an
  API key. This release does not claim a live autonomous end-to-end demonstration.
- Verification: 91 isolated Python tests plus JavaScript payload-binding/submission
  checks; real local HTTP submission and authenticated callbacks used synthetic
  replies and stubbed provider transports. No live AI requests during verification.

## v0.10.1 — Newest comments first — 2026-11-09

Classification: owner-requested minor presentation correction. Responsible agent: Codex.

- Show newest chat comments at the top without changing stored history or exports.
- Keep the feed at the top for incoming replies when already reading the latest
  comments; preserve the reading position when browsing older comments.
- Verification: JavaScript syntax and existing payload-binding check passed;
  confirmed rendering reverses a copy rather than mutating stored message order.

## v0.10.0 — Task approvals and spending controls — 2026-11-09

Classification: explicitly owner-approved spending/authorization workflow change.
Responsible agent: Codex. Local policy reference: owner-task-policy-2026-11-09.

- Added an owner-selected combined monthly API guard and Grok dispatch allowance,
  using a separate owner-only local ledger; no SQLite migration or key changes.
- Reserve estimated usage durably before requests, reconcile confirmed usage,
  retain failed/unknown reservations, and prevent concurrent budget overruns.
- Persist one task approval for its exact brief, participants and optional API
  payloads. Matching planned API steps do not require another review dialog;
  altered data, extra steps and external actions remain outside that approval.
- Scope gateway fetches to active approved tasks without deleting older work.
- Start a newly approved round in an existing discussion while retaining its
  earlier run/assignment history; suppress duplicate submissions. Retire the
  legacy direct recovery sender when the standing spending policy is active.
- Display combined API usage/reservations and Grok attempts in the existing sidebar.
- Exact-release approval for this spending change does not broaden standing update
  categories. Rollback to an older app without the guard remains read-only.
- Metered API keys remain unconfigured; no live AI request is part of installation.
  Local estimates are not provider-side billing caps; Grok counts app dispatches,
  not dollar usage or calls made elsewhere. Native routines still need one-time
  configuration to accept approved tasks instead of a single hardcoded test ID.

## Grok live roundtrip verified — 2026-11-09

Classification: explicitly human-approved single additional dispatch and temporary
privacy isolation. Responsible agent: Codex. No app release or schema migration.

- Grok fetched the public-safe assignment and posted the exact expected reply
  through its scoped authenticated callback; one linked reply, assignment complete.
- Preserved the first dispatch record. The separately approved additional send is
  recorded in a durable local one-shot audit file; ambiguous outcomes cannot retry.
- Restored original signed app/queue visibility; other records and credentials
  unchanged. No Muse/OpenAI/Gemini calls or additional webhook attempts.
- Verification: real accepted webhook, actual authenticated callback, expected
  public marker, restored app checks, and 53 passing Python regressions.
- See GROK_SMOKE_TEST.md for local evidence. This is transport verification only;
  it grants no unattended polling, agent loops or additional spending authority.

## Isolated Grok test — 2026-11-09

Classification: explicitly owner-approved temporary gateway privacy isolation and
single public-safe dispatch. Responsible agent: Codex. No schema migration.

- Added a local single-use test harness that runs a temporary program copy,
  filters only Grok fetches to the approved assignment, and restores the original
  signed app afterward. Muse and existing callbacks remain unchanged.
- Added five tests covering isolation, fail-closed scope parsing, callbacks to
  hidden work, long queues, and preservation of existing dispatch records.
- Verification: 52 regressions passed. Live webhook accepted once (HTTP 200), but
  no authenticated callback within four minutes; full roundtrip remains unverified.
- Restoration verified: original rows and credential bytes unchanged; temporary
  visibility filter removed. Public test evidence remains pending, not completed.
- No retry or other AI call. See GROK_SMOKE_TEST.md for local test evidence and
  next diagnosis. Original app remains version 0.9.3; no public update published.

## Live automatic-update acceptance — 2026-11-09 (passed)

Classification: owner-approved development-update implementation and harmless
version-only acceptance releases. Responsible agent: Codex.

- Explicitly approved repository-scoped deploy key provisioned; private CI tests,
  signs and pushes only sanitized artifacts. Public Actions verifies and publishes.
- Fixed observed deferred launchd interval scheduling with a persistent five-minute
  worker. Added tested recovery for unreadable SQLite/missing credentials.
- Actual scheduled install: 0.9.1 (release sequence 2). Actual scheduled injected-
  failure rollback: candidate 0.9.2 (sequence 3) restored healthy 0.9.1. Actual
  subsequent scheduled recovery install: 0.9.3 (sequence 4). No manual installs.
- SQLite logical contents, credentials and integration configuration preserved.
  No schema migration, agent dispatch or provider API call.
- Verification: 47 local regression tests, JavaScript syntax, successful real
  private/public Actions pipelines, running app/updater, and live backup/health
  checks. Detailed local evidence: UPDATE_ACCEPTANCE.md and .updater/events.jsonl.
- Final release: https://github.com/mistermrthomas/ai-command-center-releases/releases/tag/dev-4
- Rollback: previous signed program directory plus owner-only local snapshots.
  Major changes remain outside the automatic approval scopes; bootstrap/trust
  changes require separate local approval. See UPDATES.md for operating limits.

## v0.9.3 — final healthy version-only acceptance release

- Follows successful automatic install of 0.9.1 and scheduled rollback of the
  0.9.2 test candidate to 0.9.1 after a one-time LOCAL health failure.
- Both live checks preserved SQLite contents, conversation/assignment history,
  credentials and Muse/Grok configuration. No agent calls or migrations.
- This payload changes only version/release notes. A later scheduled install
  confirms the updater can advance beyond a quarantined failed sequence.
- Validation: 47 local regression tests passed; publishing requires CI tests.
- Responsible agent: Codex; owner-approved automatic-update acceptance scope.

## v0.9.2 — version-only rollback acceptance candidate

Owner-authorized version-only update. A one-time LOCAL health-failure marker will
exercise automatic rollback on the test Mac. No faulty executable is published.
Only version and release notes change; no database or credential changes.

## v0.9.1 — version-only automatic-update acceptance release

Owner-authorized harmless development test. Only VERSION and these release notes
change in the application payload. No executable, schema, credential or data
changes. Python regression suite and JavaScript syntax must pass before signing.

## v0.9.0 — 2026-11-09 — automatic updater bootstrap

Owner-approved scope: permanent development updates, backups, signing, launchd,
health checks and rollback. Implementer: Codex. No schema migration or redesign.

- Added isolated trusted updater and private GitHub Actions publishing workflow.
- Added pinned signing verification, file allowlists and replay protection.
- Added maintenance gating, protected SQLite/credential backups, restart health
  checks, interrupted-transaction recovery and rollback.
- Added version/process identity to local status and a stable local data directory
  setting so managed releases preserve the existing Muse/Grok configuration.
- Replaced personal details in the bundled demo with a generic public-safe example.
- Validation: 45 tests passed and JavaScript syntax passed. Live acceptance
  evidence: managed 0.9.0 restart and injected-failure rollback passed with
  unchanged data/credentials. GitHub CI passed. Public publication/automatic
  installation remains pending the scoped RELEASE_PUBLISH_TOKEN secret.
- Rollback: previous program directory plus protected backups; updater bootstrap
  changes require separate local approval. See UPDATES.md for limits and recovery.

## v0.9 — Daylight console and activity monitor
- Daytime light mode is now the default. The upper navigation stays dark. One-click light/dark toggle is saved locally per browser.
- New live activity panel shows queued, dispatched, completed, and ready-for-overseer states using only recorded server data.
- The open roundtable refreshes locally every five seconds, when visible. This does not call agent APIs or cost any tokens.
- Includes v0.8.1 fix: Collaborative uses the completed Muse assignment details and reuses completed Muse work.
- No database migration, no backend changes, no agent permission changes and no credential changes.

# AI Command Center — Source changelog

This file documents released code changes, not live agent actions. Cross-project completed actions can also be recorded in the local dashboard's **Change log**. All dates UTC unless noted.

## v0.8.1 — 2026-11-09

**Classification:** Routine bug fix. No UI redesign, database migrations, or credential changes.

- Start Collaborative now prefills the **full prompt from the latest completed Muse assignment**, rather than the original short discussion goal.
- If no completed Muse assignment exists, use the latest saved assignment before falling back to the discussion goal.
- When an existing completed Muse assignment will be reused, the review button explicitly says **Approve & start Grok (reuse Muse)**. This avoids implying Muse will run again.
- Owner still reviews and approves the exact outbound task; no new automated APIs, retries, or scheduling.

## v0.8 — 2026-11-09

**Classification:** Owner-requested Grok connection and narrowly scoped Collaborative orchestration. Existing styling retained.

- Added a localhost-only **Connect Grok** form: securely save the existing bot's routine webhook URL, sender key, and temporary HTTPS gateway origin without using Terminal or copying secrets into chat.
- Generate a unique Grok callback token (revealed one time in the local interface) and support explicit rotation. Existing Muse token remains unchanged.
- Added a single owner-approved **Start Collaborative** action. Reuses the latest completed Muse assignment for the discussion, queues an independent Grok assignment, and sends **at most one** webhook containing only the assignment ID and gateway address.
- Tracks workflow progress (`waiting_agents` vs `ready_for_overseer`) from verified assignments. Webhook acceptance is never interpreted as task completion.
- Preserves the default privacy-first policy: only approved assignment prompts are returned to agents; no transcript export or extra OpenAI/Gemini API calls occur automatically.
- Added a Mac update kit that backs up code, credentials, and a SQLite database snapshot, then replaces **only program files**. Does not replace the existing `.env`, database, or connected Muse state.
- Added regression tests for authenticated/local setup, rejected private URL destinations, scoped credentials, idempotent start, and no hidden API expenses.

**Verification:** 31 passing Python tests; `node --check` for frontend JavaScript; package integrity and preservation installer tests. The live Mac/Grok routine and visual browser workflow still require user-side confirmation. Grok's routine currently receives webhooks but needs updated permissions/instructions to GET tasks and POST replies. The automatic OpenAI overseer is not built.

## v0.7 — 2026-11-09

**Classification:** Minor feature and routine bug fixes. No major redesign.

- Added append-only SQLite `change_log` entries for implementation history across projects, including date, project, category, impact, implementer (as reported), details, verification, version/commit reference, and optional approval link.
- Added the local-only **Change log** section and entry form to the Overview dashboard.
- Added scoped change classification: routine low-risk bug fixes/minor visual fixes do not need prior approval, while major styles, major features, sensitive changes, deployments, spending, or significant impact do.
- Approval requests now include a change category. High-impact change-log records require a previously approved, matching category and exact summary. Old untyped approvals cannot authorize new major entries.
- Added automated regression tests for approval gating, append-only persistence, and isolation from the external agent gateway. Corrected hidden-modal styling so an intentionally closed modal remains hidden across browsers.
- Updated Codex instructions and build plan. No automatic agent tasks, external changes, or additional API charges enabled.

**Verification:** Local Python unit/integration tests (27) and JavaScript syntax check. These do not prove any live Grok/Muse integration or external deployment.

## v0.6 — 2026-11-09

- Local priority dashboard across projects with status, ownership and next action.
- Local approval queue and decision audit for major changes; no automatic execution on approval.

## v0.5 — 2026-11-09

- Privacy-minimized, manually reviewed outgoing prompts and narrowed agent assignment payloads.
- Added OpenAI creative/graphics role to planned orchestration.

## v0.4 — 2026-11-09

- Collaborative roundtable mode set as the default metadata for new discussions.

## v0.3 — 2026-11-09

- Added separate Grok Bot callback authentication and one-time webhook dispatch pilot.

## v0.2 — 2026-11-09

- Added Muse-only authenticated agent gateway, pending assignments and idempotent callback tests.

## v0.1 — 2026-11-09

- Initial local roundtable prototype with optional explicitly triggered API calls.
