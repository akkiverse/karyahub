# KaryaHub: Test report

**Run:** 2026-11-01 · **Branch:** `cr/0011-inventory` (CR-0011) · **Result:** 289 of 289 tests passing (151 server + 1 Postgres-only test skipped without its database, 138 web), covering all 142 current acceptance criteria (13 criteria were retired by CR-0005) · **Lint:** Ruff check and format clean · **Build:** `npm run build` passed (Vite 8)

Every web test starts signed in as the demo owner (`tests/helpers.js`) unless it tests sign-in, another role or a real business (`tests/us23-business-data.test.js` opens the app as a real business's owner against `tests/fake-sync.js`). Since CR-0005 each server test gets its own throwaway in-memory database and no test can reach a real one (an autouse fixture clears `DATABASE_URL`, `KARYAHUB_DATABASE_URL`, `POSTGRES_URL`, the PIN secret and the setup token). No test calls a real AI server: pytest sets `studio_ai.TRANSPORT` to an `httpx.MockTransport`, and Vitest uses fakes.

Three suites:
- **Web app:** 138 tests with Vitest 5 in jsdom on the fixed demo date 2027-01-01, against the real app (`mountApp`), with `tests/fake-api.js`, `tests/fake-accounts.js` and `tests/fake-sync.js` standing in for the server (they record calls and can act unreachable, lose an answer, fail, or refuse a kind of record). AC-2.2 runs with the real step timing under fake timers.
- **Server:** 151 tests with pytest and FastAPI's test client against `backend/karyahub` and an in-memory SQLite database (async, the same migrations as production), in mock mode (live-mode tests set `KARYAHUB_MODE=live`; Studio AI tests set `AI_ENDPOINTS` to a mocked server; forgot-PIN delivery uses a fake WhatsApp adapter).
- **Real Postgres (optional, 1 test):** `test_ac_23_2_on_a_real_postgres_a_scoped_session_sees_only_its_own_business` runs when `KARYAHUB_TEST_POSTGRES_URL` is set. It runs the migrations on a real Postgres 16, checks the policies and the restricted role exist, and that a scoped session with no `WHERE` sees only its own business, cannot write into another, and sees nothing with no business set. It was run on PostgreSQL 16.2 for this report, together with an end-to-end smoke run of the whole API (two businesses, sync, import, a proof-of-work step; `/api/health` said `row_level_security: on`). Without the address the test is skipped, so the normal run shows 151 passed and 1 skipped. CR-0011 extended it to the new `item_codes` table (each business sees only its own codes, the same code can exist in two businesses, and one business cannot write into the other's), and it was run again on PostgreSQL 16.2 for this report; a second smoke run of the API on that database (two businesses, items, moves, a part used on a job, a CSV check and import run twice, the activity log, `/api/health` saying `row_level_security: on`) also passed with the restricted role on.

Some criteria have a test on each side (for example AC-7.2 and AC-23.1: the web app calls the API, and the server does the work). The screen criteria AC-22.3 to AC-22.7 are tested through the screens that show AC-19, AC-20 and AC-21.

Criteria AC-13.1 to AC-13.6 and AC-15.1 to AC-15.7 were retired in CR-0005 (see the spec); their old on-device tests were replaced by the tests for AC-18 to AC-22.

CR-0011 changed five older tests for things it meant to change: the data version is now 5 (three tests in `us11-compat.test.js`), the office coordinator's navigation has Inventory (`us14-roles.test.js`, AC-14.3), and the role table has 12 permissions instead of 9 (`us15-admin.test.js`); the technician's navigation test (AC-14.1) did not change, which shows technicians get no inventory by default. The wall coverage test (`test_ac_23_2_every_business_data_table_has_a_row_level_security_policy`) now also covers migration 0003's table.

CR-0009 also changed one older test: `test_ac_19_4_owner_switches_permissions_for_a_role` now puts the job on the server first, because a real business's proof-of-work step now loads the job from the database (AC-23.6).

## Traceability: acceptance criteria to tests

| Criterion | Test | Result |
|---|---|---|
| AC-1.1 | `tests/us1-home.test.js` › AC-1.1: Home shows the headline and three problem cards | Pass |
| AC-1.2 | `tests/us1-home.test.js` › AC-1.2: Money at stake in the next 90 days equals the sum of demo AMCs expiring within 90 days | Pass |
| AC-1.3 | `tests/us1-home.test.js` › AC-1.3: "See how it works" opens the Chat screen | Pass |
| AC-2.1 | `tests/us2-chat.test.js` › AC-2.1: Chat shows a phone-style chat titled KaryaHub and at least 3 samples (2 voice notes, 1 photo) | Pass |
| AC-2.2 | `tests/us2-chat.test.js` › AC-2.2: the Ramesh Sharma voice note shows a player with duration, then within 3 seconds the bot reply and a job summary card | Pass |
| AC-2.3 | `tests/us2-chat.test.js` › AC-2.3: the job-sheet photo sample shows an image bubble and a job summary card | Pass |
| AC-2.4 | `tests/us2-chat.test.js` › AC-2.4: free text is answered by the mock LLM with a summary card, or asks for a missing customer name | Pass |
| AC-3.1 | `tests/us3-processing.test.js` › AC-3.1: the processing panel shows Transcribe, Extract, Save in order, all done, with the transcript | Pass |
| AC-3.2 | `tests/us3-processing.test.js` › AC-3.2: the Ramesh Sharma sample extracts the expected fields | Pass |
| AC-3.2 | `tests/api/test_us7_server.py::test_ac_7_2_pipeline_matches_the_demo_extraction` (transcribe and extract on the server give the AC-3.2 fields for the Ramesh sample.) | Pass |
| AC-3.3 | `tests/us3-processing.test.js` › AC-3.3: Edit, change a field and Approve saves the job with my value, first on the Jobs screen | Pass |
| AC-3.4 | `tests/us3-processing.test.js` › AC-3.4: with Simulate failure on, the failed step is red with the error text and nothing is saved | Pass |
| AC-4.1 | `tests/us4-documents.test.js` › AC-4.1: quote and invoice show business, GSTIN, customer, lines, subtotal, CGST 9% + SGST 9% and a rounded total | Pass |
| AC-4.2 | `tests/us4-documents.test.js` › AC-4.2: every document carries a visible "DEMO, not a valid tax invoice" watermark | Pass |
| AC-4.3 | `tests/us4-documents.test.js` › AC-4.3: Download opens the browser print dialog with a print-styled layout and no external service | Pass |
| AC-4.4 | `tests/us4-documents.test.js` › AC-4.4: the chat shows "Quotation sent to Ramesh Sharma" with a simulated document attachment | Pass |
| AC-5.1 | `tests/us5-renewals.test.js` › AC-5.1: the 30-day filter lists only customers expiring by 2027-01-31, soonest first | Pass |
| AC-5.2 | `tests/us5-renewals.test.js` › AC-5.2: with the 90-day filter, Money at stake equals the sum of listed AMC values | Pass |
| AC-5.3 | `tests/us5-renewals.test.js` › AC-5.3: a customer whose AMC expired before today appears under Lapsed with a red label | Pass |
| AC-5.4 | `tests/us5-renewals.test.js` › AC-5.4: Send reminder previews the customer-side WhatsApp text and marks the customer "Reminded (demo)" | Pass |
| AC-6.1 | `tests/us6-adapters.test.js` › AC-6.1: src/adapters has whatsapp, speech and llm modules with mock, live and server implementations of one interface, chosen by one config value defaulting to "server" | Pass |
| AC-6.2 | `tests/us6-adapters.test.js` › AC-6.2: in live mode with no key, a live adapter returns "Not configured: add <SERVICE> key" and the UI shows it without crashing | Pass |
| AC-6.3 | `tests/us6-adapters.test.js` › AC-6.3: in the in-browser mode, Settings shows "Demo mode: mock responses" and three services with status Mock and the key each needs | Pass |
| AC-6.4 | `tests/us6-adapters.test.js` › AC-6.4: Reset demo returns jobs, documents and reminder marks to the bundled demo data | Pass |
| AC-6.4 | `tests/us6-adapters.test.js` › AC-6.4 (changed CR-0005): Reset demo clears jobs, chat and reminders, keeps the theme, and keeps you signed in | Pass |
| AC-7.1 | `tests/api/test_us7_server.py::test_ac_7_1_health_and_meta` (/api/health answers ok and /api/v1/meta lists the tenant, mode and three services.) | Pass |
| AC-7.2 | `tests/us7-server.test.js` › AC-7.2: in server mode the Transcribe and Extract steps are answered by the KaryaHub API and say so | Pass |
| AC-7.2 | `tests/api/test_us7_server.py::test_ac_7_2_pipeline_matches_the_demo_extraction` (transcribe and extract on the server give the AC-3.2 fields for the Ramesh sample.) | Pass |
| AC-7.3 | `tests/us7-server.test.js` › AC-7.3: when the server cannot be reached, chat falls back to the in-browser demo and says so | Pass |
| AC-7.4 | `tests/us7-server.test.js` › AC-7.4: the web app turns API errors into plain messages and unreachable servers into a clear error type | Pass |
| AC-7.4 | `tests/api/test_us7_server.py::test_ac_7_4_errors_have_one_plain_shape` (errors are {"error": {"code", "message"}} with plain-English messages.) | Pass |
| AC-7.5 | `tests/api/test_us7_server.py::test_ac_7_5_live_mode_without_keys_fails_closed` (in live mode with no keys, services answer 503 "Not configured: add <SERVICE> key".) | Pass |
| AC-7.6 | `tests/us7-server.test.js` › AC-7.6: Settings in server mode shows the API version, business and each service status from the server with the server key it needs | Pass |
| AC-8.1 | `tests/api/test_us8_webhook.py::test_ac_8_1_handshake_needs_the_verify_token` (GET echoes hub.challenge only for mode=subscribe with the right verify token; else 403.) | Pass |
| AC-8.2 | `tests/api/test_us8_webhook.py::test_ac_8_2_signature_is_checked_before_anything_runs` (a missing or wrong X-Hub-Signature-256 gets 401 and nothing is processed.) | Pass |
| AC-8.2 | `tests/api/test_us8_webhook.py::test_ac_8_2_live_mode_without_app_secret_refuses` (in live mode with no app secret configured, the webhook refuses with 503 (fails closed).) | Pass |
| AC-8.3 | `tests/api/test_us8_webhook.py::test_ac_8_3_text_voice_and_photo_become_jobs_once` (text, voice and photo messages are processed; a repeated id is processed once; no phone echoed.) | Pass |
| AC-9.1 | `tests/us9-proof-of-work.test.js` › AC-9.1: an approved job starts as "Work done, waiting for customer check" with who reported it, and the Jobs list shows its status | Pass |
| AC-9.2 | `tests/us9-proof-of-work.test.js` › AC-9.2: Send code, enter the customer\'s code, then Close moves the job to Verified and Closed through the server | Pass |
| AC-9.2 | `tests/api/test_us9_workflow.py::test_ac_9_2_code_then_verify_then_close` (a 6-digit code tied to the job verifies the work, then the job closes.) | Pass |
| AC-9.3 | `tests/us9-proof-of-work.test.js` › AC-9.3: a wrong code shows "That code doesn\'t match or has expired. Send a new code." and the job stays unverified | Pass |
| AC-9.3 | `tests/api/test_us9_workflow.py::test_ac_9_3_wrong_expired_or_other_job_codes_fail` (a wrong code, an expired code or another job's code is refused and the state stays.) | Pass |
| AC-9.4 | `tests/api/test_us9_workflow.py::test_ac_9_4_actions_not_allowed_in_this_state_are_refused` (closing an unverified job (or any action not allowed in the state) gets 409.) | Pass |
| AC-9.5 | `tests/api/test_us9_workflow.py::test_ac_9_5_the_same_operation_never_counts_twice` (a repeated client_op_id returns duplicate with no new event; event ids are deterministic.) | Pass |
| AC-9.6 | `tests/us9-proof-of-work.test.js` › AC-9.6: if the server cannot be reached, proof-of-work steps explain it and nothing changes | Pass |
| AC-10.1 | `tests/api/test_us10_amc.py::test_ac_10_1_visits_every_90_days_with_overdue_escalation` (a contract ending 2027-03-15 owes 4 visits; on 2027-01-01 the 2026-12-10 visit is overdue.) | Pass |
| AC-10.2 | `tests/api/test_us10_amc.py::test_ac_10_2_jobs_are_created_lead_days_ahead_and_never_twice` (inside the lead time a visit says create the job now; a visit with a job is never listed again.) | Pass |
| AC-10.3 | `tests/us10-visits.test.js` › AC-10.3: the job screen shows the AMC service visits from the server, with the next visit and its status | Pass |
| AC-11.1 | `tests/us11-compat.test.js` › AC-11.1: data saved by v0.1.0 loads with jobs, documents, customers and settings kept, and jobs gain a workflow state | Pass |
| AC-11.2 | `tests/api/test_us11_documents.py::test_ac_11_2_gst_totals_match_the_web_app` (server GST totals equal v0.1.0's (CGST 9% + SGST 9%, rupee rounding); inter-state uses IGST 18%.) | Pass |
| AC-11.3 | `tests/us11-compat.test.js` › AC-11.3: data saved by the 0.2.0 preview (version 2) loads with jobs and proof of work kept | Pass |
| AC-12.1 | `tests/api/test_us12_docs.py::test_ac_12_1_architecture_design_and_risks_are_written_down` (HLD, LLD, RISKS and REFERENCE-REVIEW exist with their key sections.) | Pass |
| AC-14.1 | `tests/us14-roles.test.js` › AC-14.1: a technician lands on Chat, sees only Chat and Jobs, and job screens hide paperwork and closing | Pass |
| AC-14.2 | `tests/us14-roles.test.js` › AC-14.2: a technician opening Home, Renewals, Settings, Admin or a document gets a plain no-access page and none of that screen's content | Pass |
| AC-14.3 | `tests/us14-roles.test.js` › AC-14.3: an office coordinator works with Home, Chat, Jobs, Inventory and Renewals, can make quotes and close jobs, but not Admin or Settings | Pass |
| AC-14.4 | `tests/us14-roles.test.js` › AC-14.4: a technician's proof-of-work step names them in the history, sends no role (the server knows it), and a step their access doesn't cover is refused here too | Pass |
| AC-14.5 | `tests/us14-roles.test.js` › AC-14.5 (web side): the starting role table matches the server rules for every job action | Pass |
| AC-14.5 | `tests/api/test_us14_access.py::test_ac_14_5_roles_endpoint_matches_web_app` (GET /api/v1/access/roles returns the same roles and permissions as the web app.) | Pass |
| AC-14.5 | `tests/api/test_us14_access.py::test_ac_14_5_technician_cannot_close_a_job` (a technician closing a job gets 403 with a plain message, and nothing changes.) | Pass |
| AC-14.5 | `tests/api/test_us14_access.py::test_ac_14_5_allowed_roles_pass` (coordinators may close, and technicians may send the customer code.) | Pass |
| AC-14.5 | `tests/api/test_us14_access.py::test_ac_14_5_the_tenant_header_is_ignored` (X-Tenant-Id can't pick another business; the signed-in person's business is used.) | Pass |
| AC-16.1 | `tests/us16-look.test.js` › AC-16.1: Home shows a "Today at" row with jobs, waiting checks, renewals in 30 days with money, and paperwork, from the data | Pass |
| AC-16.2 | `tests/us16-look.test.js` › AC-16.2: every signed-in screen shows the business and who is signed in, with Sign out | Pass |
| AC-17.1 | `tests/api/test_us17_studio_ai.py::test_ac_17_1_without_ai_settings_the_demo_reader_is_used` (with no AI settings, messages are read by the bundled demo reader and nothing calls an AI server.) | Pass |
| AC-17.2 | `tests/api/test_us17_studio_ai.py::test_ac_17_2_ai_reads_the_job_with_a_json_schema` (with AI set up, the report goes to the everyday model, gemma4:e4b by default since CR-0010, with the job schema at temperature 0, and the validated answer is the job.) | Pass |
| AC-17.3 | `tests/api/test_us17_studio_ai.py::test_ac_17_3_no_customer_name_keeps_the_ask_for_a_name_behaviour` (when the AI finds no customer name, the answer is found=false with customer_name missing.) | Pass |
| AC-17.4 | `tests/api/test_us17_studio_ai.py::test_ac_17_4_ai_answers_are_validated_and_bad_ones_fall_back` (AI answers are untrusted: bad phone and date values are dropped, and an unusable answer falls back to the quick reader.) | Pass |
| AC-17.5 | `tests/api/test_us17_studio_ai.py::test_ac_17_5_ai_reads_the_job_sheet_photo` (a photo sent with the request is read by the AI (image attached) and the text comes back labelled as AI.) | Pass |
| AC-17.6 | `tests/api/test_us17_studio_ai.py::test_ac_17_6_ai_offline_falls_back_and_everything_else_works` (with the AI server off, messages are read without AI (labelled), unknown photos answer 503 ai_unavailable, and non-AI features still work.) | Pass |
| AC-17.7 | `tests/us17-studio-ai.test.js` › AC-17.7: a message read by Studio AI says so on the processing steps and the job card | Pass |
| AC-17.8 | `tests/us17-studio-ai.test.js` › AC-17.8: when AI is offline the message is read without AI, clearly labelled, and still becomes a draft | Pass |
| AC-17.9 | `tests/us17-studio-ai.test.js` › AC-17.9: the job sheet photo is sent to the server as an image for Studio AI to read | Pass |
| AC-17.10 | `tests/us17-studio-ai.test.js` › AC-17.10: if the AI server is offline and a photo can\'t be read, the message stays with Try again, and the offline banner shows | Pass |
| AC-17.11 | `tests/us17-studio-ai.test.js` › AC-17.11: the offline banner follows /api/ai/status and stays quiet when AI isn\'t set up | Pass |
| AC-17.12 | `tests/us17-studio-ai.test.js` › AC-17.12: chat saved by v0.2.0 (cards without a reader) still shows and approves as before | Pass |
| AC-18.1 | `tests/us13-signin.test.js` › AC-18.1 (screen): the right number and PIN open the right start page with the name, role and business | Pass |
| AC-18.1 | `tests/us13-signin.test.js` › AC-18.1 (screen): Sign out ends the session on the server and returns to Sign in with a message | Pass |
| AC-18.1 | `tests/api/test_us18_signin.py::test_ac_18_1_sign_in_sets_a_session_and_me_says_who` (a right number and PIN signs in, sets an HttpOnly cookie, and /auth/me knows the person.) | Pass |
| AC-18.1 | `tests/api/test_us18_signin.py::test_ac_18_1_sign_out_ends_the_session` (after signing out the old cookie no longer works.) | Pass |
| AC-18.2 | `tests/us13-signin.test.js` › AC-18.2 (screen): a wrong number or PIN shows one plain message and stays on Sign in | Pass |
| AC-18.2 | `tests/api/test_us18_signin.py::test_ac_18_2_every_wrong_answer_reads_the_same` (wrong PIN, unknown number and a switched-off person all get one message.) | Pass |
| AC-18.3 | `tests/api/test_us18_signin.py::test_ac_18_3_five_wrong_tries_lock_a_number_for_a_while` (5 wrong PINs block the number (even the right PIN), whether or not it has an account.) | Pass |
| AC-18.4 | `tests/api/test_us18_signin.py::test_ac_18_4_pins_are_stored_only_as_salted_hashes` (hashes differ per person, depend on the server secret, and verify only the right PIN.) | Pass |
| AC-18.4 | `tests/api/test_us18_signin.py::test_ac_18_4_the_database_holds_no_plain_pin` (the users table has salted hashes, never the PIN itself.) | Pass |
| AC-18.4 | `tests/api/test_us18_signin.py::test_ac_18_4_weak_pins_are_refused` (repeated digits, simple runs and wrong lengths can't be PINs; generated PINs are fine.) | Pass |
| AC-18.5 | `tests/us13-signin.test.js` › AC-18.5 (client): the client marks every request as the app\'s own, and tells the app when a session has ended | Pass |
| AC-18.5 | `tests/api/test_us14_access.py::test_ac_18_5_job_and_ai_routes_need_sign_in` (without signing in, job, AI and paperwork routes answer 401.) | Pass |
| AC-18.5 | `tests/api/test_us18_signin.py::test_ac_18_5_changing_data_needs_the_app_header` (a request with a session cookie but without the app's header is refused (cross-site safety).) | Pass |
| AC-18.5 | `tests/api/test_us18_signin.py::test_ac_18_5_a_forged_or_expired_session_is_not_signed_in` (a made-up cookie value means signed out.) | Pass |
| AC-18.6 | `tests/us13-signin.test.js` › AC-18.6 and AC-22.7 (screen): a temporary PIN must be changed first; mismatches and wrong current PINs are explained | Pass |
| AC-18.6 | `tests/api/test_us18_signin.py::test_ac_18_6_a_temporary_pin_must_be_changed_before_anything_else` (a person on a temporary PIN can only choose their own PIN until they do.) | Pass |
| AC-18.7 | `tests/api/test_us14_access.py::test_ac_18_7_a_role_sent_in_the_request_is_ignored` (a technician who claims to be the owner in the request body is still a technician.) | Pass |
| AC-19.1 | `tests/us15-admin.test.js` › AC-19.1 and AC-22.5 (screen): Admin shows counts by role, the team, add and import forms, the role table and the activity log | Pass |
| AC-19.1 | `tests/us15-admin.test.js` › AC-19.1 and AC-22.5 (screen): adding a person shows their PIN once, in a panel that can be dismissed or downloaded | Pass |
| AC-19.1 | `tests/us15-admin.test.js` › AC-19.1 and AC-22.5 (screen): a number that already has an account is explained and the form keeps what was typed | Pass |
| AC-19.1 | `tests/api/test_us19_team.py::test_ac_19_1_owner_adds_a_person_and_the_pin_is_shown_once` (the owner adds name, mobile and role; a generated PIN is shown once and works for sign-in.) | Pass |
| AC-19.1 | `tests/api/test_us19_team.py::test_ac_19_1_a_mobile_number_belongs_to_one_account_everywhere` (the same number can't be added twice, in one business or across businesses.) | Pass |
| AC-19.1 | `tests/api/test_us19_team.py::test_ac_19_1_bad_details_are_refused_in_plain_words` (names, numbers, roles and PINs are checked.) | Pass |
| AC-19.2 | `tests/us15-admin.test.js` › AC-19.2 and AC-22.5 (screen): importing a file adds good rows, lists bad ones with the row number, and shows the PINs once | Pass |
| AC-19.2 | `tests/api/test_us19_team.py::test_ac_19_2_csv_import_adds_good_rows_and_reports_bad_ones` (good rows are added (PIN generated when blank); bad rows come back with row and reason.) | Pass |
| AC-19.2 | `tests/api/test_us19_team.py::test_ac_19_2_csv_needs_the_right_columns_and_a_sane_size` (a file without the needed columns, or an empty one, is refused.) | Pass |
| AC-19.3 | `tests/us15-admin.test.js` › AC-19.3 and AC-22.5 (screen): changing a role, turning access off and on, and resetting a PIN each say what happened | Pass |
| AC-19.3 | `tests/us15-admin.test.js` › AC-19.3 and AC-22.5 (screen): owners cannot change or switch off themselves | Pass |
| AC-19.3 | `tests/api/test_us19_team.py::test_ac_19_3_owner_changes_roles_access_and_pins` (role change, turning access off (ends sessions), and a PIN reset that works.) | Pass |
| AC-19.3 | `tests/api/test_us19_team.py::test_ac_19_3_owners_cannot_demote_or_switch_off_themselves` (no one changes their own role or access; a second owner can step in.) | Pass |
| AC-19.3 | `tests/api/test_us19_team.py::test_ac_19_3_a_delegate_cannot_make_or_change_owners` (someone given 'manage team' who isn't an owner can't add owners or touch them.) | Pass |
| AC-19.4 | `tests/us14-roles.test.js` › AC-19.4 and AC-22.3 (screen): the server's permissions decide what opens, so an owner's switches change the screens | Pass |
| AC-19.4 | `tests/us15-admin.test.js` › AC-19.4 and AC-22.5 (screen): the role table has switches that save at once; owners are locked on | Pass |
| AC-19.4 | `tests/us15-admin.test.js` › AC-19.4 and AC-22.5 (screen): one person can be given or refused a single permission, then put back to the role default | Pass |
| AC-19.4 | `tests/us15-admin.test.js` › AC-19.4 and AC-22.5 (screen): people without "manage team" get the no-access page for Admin | Pass |
| AC-19.4 | `tests/api/test_us19_team.py::test_ac_19_4_owner_switches_permissions_for_a_role` (switching 'close jobs' on for technicians lets them close; switching it off takes it away.) | Pass |
| AC-19.4 | `tests/api/test_us19_team.py::test_ac_19_4_owner_overrides_one_person` (allow or block one permission for one person, then go back to the role default.) | Pass |
| AC-19.4 | `tests/api/test_us19_team.py::test_ac_19_4_an_owner_always_keeps_team_and_settings` (owners can't lose access to the team or settings, and only coordinator/technician rows are editable.) | Pass |
| AC-19.4 | `tests/api/test_us19_team.py::test_ac_19_4_people_without_manage_team_cannot_open_it` (coordinators and technicians don't get the team screens unless the owner allows it.) | Pass |
| AC-19.5 | `tests/api/test_us19_team.py::test_ac_19_5_a_business_only_ever_sees_its_own_people` (another business's team can't be listed, changed, reset or read in the audit log.) | Pass |
| AC-19.6 | `tests/api/test_us19_team.py::test_ac_19_6_team_changes_are_in_the_audit_log` (who did what, newest first.) | Pass |
| AC-19.7 | `tests/us15-admin.test.js` › AC-19.7 and AC-22.5 (screen): the demo business shows its team but every control is switched off, with a plain note | Pass |
| AC-19.7 | `tests/api/test_us19_team.py::test_ac_19_7_the_demo_business_team_is_read_only` (visitors can't add people to, or change, the public demo business.) | Pass |
| AC-19.8 | `tests/us15-admin.test.js` › AC-19.8 and AC-22.5 (screen): the owner saves business details in Settings and the whole app uses them | Pass |
| AC-19.8 | `tests/api/test_us19_team.py::test_ac_19_8_owner_edits_the_business_details` (name, address, GSTIN and state are saved on the server and checked.) | Pass |
| AC-20.1 | `tests/us13-signin.test.js` › AC-20.1 and AC-22.7 (screen): First-time setup shows only while no platform admin exists, and needs the setup token | Pass |
| AC-20.1 | `tests/api/test_us20_platform.py::test_ac_20_1_first_time_setup_needs_the_setup_token` (the platform admin is created once, only with the setup token.) | Pass |
| AC-20.1 | `tests/api/test_us20_platform.py::test_ac_20_1_the_setup_token_recovers_the_platform_admin_only` (with the token and the same number the PIN is reset; another number can't take over.) | Pass |
| AC-20.2 | `tests/us20-businesses.test.js` › AC-20.2 and AC-22.4 (screen): lists every business with people, owner and status; the demo cannot be switched off | Pass |
| AC-20.2 | `tests/us20-businesses.test.js` › AC-20.2 and AC-22.4 (screen): creating a business shows the owner their temporary PIN once | Pass |
| AC-20.2 | `tests/us20-businesses.test.js` › AC-20.2 and AC-22.4 (screen): a clash or a mistake is explained and the form keeps what was typed | Pass |
| AC-20.2 | `tests/us20-businesses.test.js` › AC-20.2 and AC-22.4 (screen): a business can be turned off and on | Pass |
| AC-20.2 | `tests/api/test_us20_platform.py::test_ac_20_2_platform_admin_creates_a_business_with_its_first_owner` (the business and owner are created together; the temporary PIN is shown once.) | Pass |
| AC-20.2 | `tests/api/test_us20_platform.py::test_ac_20_2_bad_business_details_are_refused` (name, GSTIN, owner number and a duplicate owner number are checked.) | Pass |
| AC-20.2 | `tests/api/test_us20_platform.py::test_ac_20_2_turning_a_business_off_stops_its_people` (when a business is off its people are signed out and can't sign in; the demo stays on.) | Pass |
| AC-20.3 | `tests/api/test_us20_platform.py::test_ac_20_3_the_platform_admin_sees_no_business_data` (team, jobs, AI and paperwork routes are closed to the platform admin.) | Pass |
| AC-20.4 | `tests/us20-businesses.test.js` › AC-20.4 (screen): resetting an owner's PIN shows the new temporary PIN once | Pass |
| AC-20.4 | `tests/api/test_us20_platform.py::test_ac_20_4_platform_admin_resets_an_owners_pin` (a locked-out owner gets a new temporary PIN and must choose their own.) | Pass |
| AC-20.5 | `tests/us20-businesses.test.js` › AC-20.5 and AC-22.4 (screen): a business owner opening Businesses gets the no-access page | Pass |
| AC-20.5 | `tests/api/test_us20_platform.py::test_ac_20_5_only_the_platform_admin_runs_businesses` (a business owner can't list, create or switch off businesses.) | Pass |
| AC-21.1 | `tests/us13-signin.test.js` › AC-21.1 and AC-22.7 (screen): Forgot PIN sends a code, then a new PIN is chosen with it; the demo shows the code on screen | Pass |
| AC-21.1 | `tests/api/test_us20_platform.py::test_ac_21_1_a_code_lets_a_person_set_a_new_pin` (ask for a code with a number, use it to set a new PIN; old sessions end; the code works once.) | Pass |
| AC-21.1 | `tests/api/test_us20_platform.py::test_ac_21_1_codes_expire_run_out_of_tries_and_are_rate_limited` (5 wrong tries kill a code; at most 3 codes per 15 minutes per number.) | Pass |
| AC-21.1 | `tests/api/test_us20_platform.py::test_ac_21_1_an_expired_code_is_refused` (a code is only good for the configured time.) | Pass |
| AC-21.2 | `tests/us13-signin.test.js` › AC-21.2 and AC-22.7 (screen): when codes are not switched on the screen says so and points to the owner | Pass |
| AC-21.2 | `tests/api/test_us20_platform.py::test_ac_21_2_real_businesses_are_told_to_ask_their_owner_until_codes_are_live` (until WhatsApp is live only demo accounts get a code; everyone else (known or not) gets the same answer.) | Pass |
| AC-21.2 | `tests/api/test_us20_platform.py::test_ac_21_2_when_live_the_code_goes_out_by_whatsapp_and_never_in_the_answer` (in live mode the code is sent through the WhatsApp adapter, and the reply doesn't contain it.) | Pass |
| AC-22.1 | `tests/us13-signin.test.js` › AC-22.1: signed out, any address shows only Sign in to KaryaHub, with no business name and no demo tag | Pass |
| AC-22.1 | `tests/us13-signin.test.js` › AC-22.1: demo accounts sit under "Explore a demo business"; tapping one fills the number and PIN | Pass |
| AC-22.2 | `tests/us14-roles.test.js` › AC-22.2: real businesses show no demo wording, watermark or sample chips; the demo business does | Pass |
| AC-22.3 | `tests/us14-roles.test.js` › AC-19.4 and AC-22.3 (screen): the server's permissions decide what opens, so an owner's switches change the screens | Pass |
| AC-22.4 | `tests/us20-businesses.test.js` › AC-20.2 and AC-22.4 (screen): lists every business with people, owner and status; the demo cannot be switched off | Pass |
| AC-22.4 | `tests/us20-businesses.test.js` › AC-20.2 and AC-22.4 (screen): creating a business shows the owner their temporary PIN once | Pass |
| AC-22.4 | `tests/us20-businesses.test.js` › AC-20.2 and AC-22.4 (screen): a clash or a mistake is explained and the form keeps what was typed | Pass |
| AC-22.4 | `tests/us20-businesses.test.js` › AC-20.2 and AC-22.4 (screen): a business can be turned off and on | Pass |
| AC-22.4 | `tests/us20-businesses.test.js` › AC-20.5 and AC-22.4 (screen): a business owner opening Businesses gets the no-access page | Pass |
| AC-22.5 | `tests/us15-admin.test.js` › AC-19.1 and AC-22.5 (screen): Admin shows counts by role, the team, add and import forms, the role table and the activity log | Pass |
| AC-22.5 | `tests/us15-admin.test.js` › AC-19.1 and AC-22.5 (screen): adding a person shows their PIN once, in a panel that can be dismissed or downloaded | Pass |
| AC-22.5 | `tests/us15-admin.test.js` › AC-19.1 and AC-22.5 (screen): a number that already has an account is explained and the form keeps what was typed | Pass |
| AC-22.5 | `tests/us15-admin.test.js` › AC-19.2 and AC-22.5 (screen): importing a file adds good rows, lists bad ones with the row number, and shows the PINs once | Pass |
| AC-22.5 | `tests/us15-admin.test.js` › AC-19.3 and AC-22.5 (screen): changing a role, turning access off and on, and resetting a PIN each say what happened | Pass |
| AC-22.5 | `tests/us15-admin.test.js` › AC-19.3 and AC-22.5 (screen): owners cannot change or switch off themselves | Pass |
| AC-22.5 | `tests/us15-admin.test.js` › AC-19.4 and AC-22.5 (screen): the role table has switches that save at once; owners are locked on | Pass |
| AC-22.5 | `tests/us15-admin.test.js` › AC-19.4 and AC-22.5 (screen): one person can be given or refused a single permission, then put back to the role default | Pass |
| AC-22.5 | `tests/us15-admin.test.js` › AC-19.7 and AC-22.5 (screen): the demo business shows its team but every control is switched off, with a plain note | Pass |
| AC-22.5 | `tests/us15-admin.test.js` › AC-19.4 and AC-22.5 (screen): people without "manage team" get the no-access page for Admin | Pass |
| AC-22.5 | `tests/us15-admin.test.js` › AC-19.8 and AC-22.5 (screen): the owner saves business details in Settings and the whole app uses them | Pass |
| AC-22.6 | `tests/us15-admin.test.js` › AC-22.6: My account shows the person, what they can do, and changes their PIN | Pass |
| AC-22.7 | `tests/us13-signin.test.js` › AC-18.6 and AC-22.7 (screen): a temporary PIN must be changed first; mismatches and wrong current PINs are explained | Pass |
| AC-22.7 | `tests/us13-signin.test.js` › AC-21.1 and AC-22.7 (screen): Forgot PIN sends a code, then a new PIN is chosen with it; the demo shows the code on screen | Pass |
| AC-22.7 | `tests/us13-signin.test.js` › AC-21.2 and AC-22.7 (screen): when codes are not switched on the screen says so and points to the owner | Pass |
| AC-22.7 | `tests/us13-signin.test.js` › AC-20.1 and AC-22.7 (screen): First-time setup shows only while no platform admin exists, and needs the setup token | Pass |
| AC-22.8 | `tests/us11-compat.test.js` › AC-22.8: data saved by v0.3.0 (version 3, with the on-device team) loads for the demo business without the team and keeps jobs and documents | Pass |
| AC-22.8 | `tests/us11-compat.test.js` › AC-22.8: each business keeps its own data on this device, a new business starts empty, and switching back restores each | Pass |
| AC-22.9 | `tests/us13-signin.test.js` › AC-22.9: the real app asks the server who is signed in; a network failure shows a calm retry screen | Pass |
| AC-22.9 | `tests/us13-signin.test.js` › AC-22.9: when the server answers with a problem the screen says so instead of blaming the internet | Pass |
| AC-22.9 | `tests/us14-roles.test.js` › AC-22.9: a platform admin sees only the Businesses screen and no business screens | Pass |
| AC-22.10 | `tests/us15-admin.test.js` › AC-22.10: adding a person shows progress, ignores a second press and brings the new PIN into view | Pass |
| AC-22.10 | `tests/us20-businesses.test.js` › AC-22.10: pressing Create business shows progress, a second press is ignored, and the new PIN is brought into view | Pass |
| AC-22.10 | `tests/us20-businesses.test.js` › AC-22.10: after a refused attempt the button comes back and keeps what was typed | Pass |
| AC-22.10 | `tests/us20-businesses.test.js` › AC-22.10: Reset PIN and Turn off can only be pressed once at a time | Pass |
| AC-22.11 | `tests/us23-business-data.test.js` › AC-22.11: the Add a person button at the top of Admin stays on Admin and puts the cursor in the form | Pass |
| AC-23.1 | `tests/us23-business-data.test.js` › AC-23.1: a job approved in Chat is saved on the server, numbered by it, and shown as New until then | Pass |
| AC-23.1 | `tests/api/test_us23_business_data.py::test_ac_23_1_another_phone_of_the_same_business_gets_what_was_saved` (customers, jobs, documents and chat saved by one phone reach another phone of the business.) | Pass |
| AC-23.2 | `tests/api/test_us23_business_data.py::test_ac_23_2_one_business_cannot_read_or_change_anothers_records` (a pull never includes the other business, and reusing an id makes a separate record.) | Pass |
| AC-23.2 | `tests/api/test_us23_business_data.py::test_ac_23_2_a_proof_of_work_step_on_another_businesss_job_is_refused` (B cannot move A's job along, even knowing its id.) | Pass |
| AC-23.2 | `tests/api/test_us23_business_data.py::test_ac_23_2_the_platform_admin_has_no_business_data` (the platform admin runs KaryaHub but belongs to no business, so the sync call is closed to them.) | Pass |
| AC-23.2 | `tests/api/test_us23_business_data.py::test_ac_23_2_every_business_data_table_has_a_row_level_security_policy` (each table with a business_id (except the account tables) is covered by the migration's policy.) | Pass |
| AC-23.2 | `tests/api/test_us23_business_data.py::test_ac_23_2_health_says_whether_the_wall_is_up` (/api/health has a row_level_security field once a real database is used; none in memory.) | Pass |
| AC-23.2 | `tests/api/test_us23_business_data.py::test_ac_23_2_on_a_real_postgres_a_scoped_session_sees_only_its_own_business` (policies, the restricted role and a bare select, run against a real Postgres.) | Pass |
| AC-23.3 | `tests/us23-business-data.test.js` › AC-23.3: when the owner takes a kind of record away, this phone stops showing it | Pass |
| AC-23.3 | `tests/api/test_us23_business_data.py::test_ac_23_3_each_kind_of_record_needs_the_owners_permission` (technicians can't read or save documents until the owner allows it; a refusal says why.) | Pass |
| AC-23.3 | `tests/api/test_us23_business_data.py::test_ac_23_3_a_rejected_change_brings_back_the_servers_version` (when the change is refused the phone gets the record as the server has it.) | Pass |
| AC-23.3 | `tests/api/test_us23_business_data.py::test_ac_23_3_bad_changes_are_rejected_and_the_good_ones_still_apply` (one bad change doesn't stop the rest of the batch.) | Pass |
| AC-23.4 | `tests/us23-business-data.test.js` › AC-23.4: when the answer is lost, the same operations are sent again and nothing is duplicated | Pass |
| AC-23.4 | `tests/api/test_us23_business_data.py::test_ac_23_4_a_change_sent_twice_is_applied_once` (a lost answer and a retry (same operation ids) leave one record and the same answer.) | Pass |
| AC-23.5 | `tests/api/test_us23_business_data.py::test_ac_23_5_two_phones_get_different_numbers_and_never_overwrite_each_other` (numbers come from the business's counters, not from the phones.) | Pass |
| AC-23.5 | `tests/api/test_us23_business_data.py::test_ac_23_5_the_cursor_returns_only_what_changed_since` (the answer carries a cursor; asking again with it returns only newer changes, in pages.) | Pass |
| AC-23.6 | `tests/us23-business-data.test.js` › AC-23.6: a proof-of-work step waits for the job to reach the server, and the server's state is not sent back as a change | Pass |
| AC-23.6 | `tests/api/test_us23_business_data.py::test_ac_23_6_state_history_and_code_belong_to_the_server` (a step is saved on the server, other phones see it, and a stale phone can't undo it.) | Pass |
| AC-23.6 | `tests/api/test_us23_business_data.py::test_ac_23_6_the_customer_code_is_kept_on_the_server_with_the_job` (the code challenge is stored with the job; verifying uses the stored state, not the phone's.) | Pass |
| AC-23.6 | `tests/api/test_us23_business_data.py::test_ac_23_6_a_step_on_a_job_that_has_not_reached_the_server_is_refused` (a plain message says to wait for the waiting changes to send.) | Pass |
| AC-23.7 | `tests/us23-business-data.test.js` › AC-23.7 and AC-23.8: what was on this phone before is moved to the server once, with a notice, and not again | Pass |
| AC-23.7 | `tests/api/test_us23_business_data.py::test_ac_23_7_old_data_on_a_phone_is_moved_once_with_numbers_and_links_kept` (ids are made unique, numbers are kept, links are re-pointed and the counters move past them.) | Pass |
| AC-23.7 | `tests/api/test_us23_business_data.py::test_ac_23_7_a_second_try_from_the_same_phone_imports_nothing` (once per phone, however many times it is asked.) | Pass |
| AC-23.7 | `tests/api/test_us23_business_data.py::test_ac_23_7_two_phones_of_one_business_can_both_import_without_clashes` (customers are merged by mobile number and clashing job numbers are renumbered.) | Pass |
| AC-23.7 | `tests/api/test_us23_business_data.py::test_ac_23_7_nothing_is_imported_without_the_permission_to_save_it` (a person who can't save documents doesn't get documents imported; the rest is.) | Pass |
| AC-23.8 | `tests/us23-business-data.test.js` › AC-23.8: a real business loads its data from the server, and the demo business never syncs | Pass |
| AC-23.8 | `tests/us23-business-data.test.js` › AC-23.7 and AC-23.8: what was on this phone before is moved to the server once, with a notice, and not again | Pass |
| AC-23.9 | `tests/us23-business-data.test.js` › AC-23.9: changes made with no signal are kept on the phone, counted on screen, and sent once when it returns, even after the app was closed | Pass |
| AC-23.10 | `tests/us23-business-data.test.js` › AC-23.10: a server fault keeps the queue and tries again; a refused change is shown with its reason and the server version is put back | Pass |
| AC-23.11 | `tests/us23-business-data.test.js` › AC-23.11: the owner adds a logo in Settings, it shows on documents, and can be removed | Pass |
| AC-23.11 | `tests/us23-business-data.test.js` › AC-23.11: the demo business has no logo controls | Pass |
| AC-23.11 | `tests/api/test_us23_business_data.py::test_ac_23_11_the_owner_adds_a_logo_and_only_that_business_can_see_it` (PNG, JPEG or WebP up to 200 KB; served to the business's people only; each change is logged.) | Pass |
| AC-23.11 | `tests/api/test_us23_business_data.py::test_ac_23_11_a_logo_must_be_a_small_real_picture` (wrong type, broken text, a different file type inside, too big, or a link are all refused.) | Pass |
| AC-23.11 | `tests/api/test_us23_business_data.py::test_ac_23_11_only_the_owner_changes_the_logo_and_the_demo_is_fixed` (a coordinator can't change the logo; the demo business's can't change either.) | Pass |
| AC-23.12 | `tests/api/test_us23_business_data.py::test_ac_23_12_the_demo_business_never_syncs` (the demo owner gets a plain refusal; the demo's data stays on the device.) | Pass |
| AC-24.1 | `tests/api/test_us24_smooth_ai.py::test_ac_24_1_health_shows_the_released_version` (health and meta show studio.json's version; the server's bundled copy matches.) | Pass |
| AC-24.2 | `tests/api/test_us24_smooth_ai.py::test_ac_24_2_a_model_the_mac_lacks_is_not_offline` (AI_MODEL=qwen3.5:9b on a Mac without it: read by gemma4:e4b, not offline; the 404 is paid once.) | Pass |
| AC-24.3 | `tests/api/test_us24_smooth_ai.py::test_ac_24_3_photos_use_the_vision_model` (notes and photos use gemma4:e4b; with AI_MODEL_VISION=qwen3-vl:8b photos use it.) | Pass |
| AC-24.4 | `tests/api/test_us24_smooth_ai.py::test_ac_24_4_time_limits_fit_inside_the_server_function` (maxDuration 120; step 90 by default, settable, capped at 110.) | Pass |
| AC-24.5 | `tests/api/test_us24_smooth_ai.py::test_ac_24_5_a_slow_answer_is_waited_for` (a slower answer within the limit is used.) | Pass |
| AC-24.6 | `tests/api/test_us24_smooth_ai.py::test_ac_24_6_too_slow_falls_back_and_nothing_is_lost` (past the limit: quick reader with the offline note, details kept.) | Pass |
| AC-24.7 | `tests/api/test_us24_smooth_ai.py::test_ac_24_7_opening_chat_warms_the_models` (both models loaded with an empty chat and keep_alive 30m; a second call within a minute is skipped.) | Pass |
| AC-24.7 | `tests/api/test_us24_smooth_ai.py::test_ac_24_7_warming_never_fails_and_needs_sign_in` (not set up and offline answer calmly; signed out is refused.) | Pass |
| AC-24.8 | `tests/api/test_us24_smooth_ai.py::test_ac_24_8_photo_text_streams_as_it_is_read` (pieces then a final line with reader ai; the AI got stream=true and the photo.) | Pass |
| AC-24.8 | `tests/api/test_us24_smooth_ai.py::test_ac_24_8_streaming_falls_back_like_before` (offline: the sample's stored text labelled; an unknown photo ends with ai_unavailable.) | Pass |
| AC-24.8 | `tests/api/test_us24_smooth_ai.py::test_ac_24_8_bad_photos_are_refused_before_streaming` (not a photo: 422 at once; simulated failure 422; no AI set up: demo text in one line.) | Pass |
| AC-24.9 | `tests/api/test_us24_smooth_ai.py::test_ac_24_9_every_ai_call_is_logged_without_secrets` (log lines name the models, server and seconds; never the key, address or note.) | Pass |
| AC-24.10 | `tests/us24-smooth-ai.test.js` › AC-24.10: opening Chat asks the server to load the AI models, once every few minutes, without showing anything | Pass |
| AC-24.10 | `tests/us24-smooth-ai.test.js` › AC-24.10: people without Chat, and a failing warm-up, show nothing | Pass |
| AC-24.11 | `tests/us24-smooth-ai.test.js` › AC-24.11: while the AI reads a message, Chat says what it is doing, counts the seconds and offers Stop | Pass |
| AC-24.11 | `tests/us24-smooth-ai.test.js` › AC-24.11: Stop ends the wait, keeps the message with Try again, and Try again reads it | Pass |
| AC-24.12 | `tests/us24-smooth-ai.test.js` › AC-24.12: a job-sheet photo shows its text as the AI reads it, then the finished transcript | Pass |
| AC-24.12 | `tests/us24-smooth-ai.test.js` › AC-24.12: the sample photo still works with a server that has no stream (older server or in-browser mode) | Pass |
| AC-24.13 | `tests/us24-smooth-ai.test.js` › AC-24.13: the API client reads the photo stream piece by piece and returns the final answer | Pass |
| AC-24.13 | `tests/us24-smooth-ai.test.js` › AC-24.13: a stream that ends with an error, an unreachable server and Stop are told apart | Pass |
| AC-24.13 | `tests/us24-smooth-ai.test.js` › AC-24.13: the app waits longer than the server's 90-second AI step before giving up | Pass |
| AC-24.14 | `tests/us24-smooth-ai.test.js` › AC-24.14: after a message is read, Send works again for the next one (it stayed greyed out before) | Pass |
| AC-25.1 | `tests/api/test_us25_inventory.py::test_ac_25_1_an_owner_sees_the_items_and_their_quantity` (items of the business reach the phone with the quantity the server worked out.) | Pass |
| AC-25.1 | `tests/us25-inventory.test.js` › AC-25.1: Inventory lists the business's items by name with quantity and tiles for items, low and out | Pass |
| AC-25.1 | `tests/us25-inventory.test.js` › AC-25.1: a real business gets its items from the server, not from the demo sample | Pass |
| AC-25.2 | `tests/us25-inventory.test.js` › AC-25.2: search finds items by every word of the name or code, ignoring capitals, spaces, dots and µ | Pass |
| AC-25.2 | `tests/us25-inventory.test.js` › AC-25.2: the chips All, Low, Out and Stopped show their counts and filter the list | Pass |
| AC-25.3 | `tests/us25-inventory.test.js` › AC-25.3: the mark is Low at or below the level, Out at zero, Short by N below zero, and none with no level | Pass |
| AC-25.4 | `tests/api/test_us25_inventory.py::test_ac_25_4_an_item_is_checked_and_its_code_is_unique_in_the_business` (each wrong field is refused in plain words; a used code names the item that has it.) | Pass |
| AC-25.4 | `tests/api/test_us25_inventory.py::test_ac_25_4_a_code_can_be_freed_by_renaming_and_taken_by_another_item` (changing an item's code frees the old one; two phones can't both take the same code.) | Pass |
| AC-25.4 | `tests/api/test_us25_inventory.py::test_ac_25_4_editing_an_item_never_changes_the_quantity` (the quantity belongs to the server; a phone's copy of it is ignored.) | Pass |
| AC-25.4 | `tests/us25-inventory.test.js` › AC-25.4: adding an item checks every field, keeps the code unique and saves opening stock as a first move | Pass |
| AC-25.4 | `tests/us25-inventory.test.js` › AC-25.4: editing an item changes its details and never its quantity | Pass |
| AC-25.5 | `tests/api/test_us25_inventory.py::test_ac_25_5_an_item_is_stopped_not_deleted` (a stopped item keeps its history, takes no new stock or parts, and can be used again.) | Pass |
| AC-25.5 | `tests/us25-inventory.test.js` › AC-25.5: an item is stopped, not deleted: it leaves the list and the pickers, keeps its history, and can be used again | Pass |
| AC-25.6 | `tests/api/test_us25_inventory.py::test_ac_25_6_the_check_lists_every_row_and_saves_nothing` (Check reports new, update and problem rows with row numbers and reasons; nothing is saved.) | Pass |
| AC-25.6 | `tests/api/test_us25_inventory.py::test_ac_25_6_import_saves_the_good_rows_with_their_opening_stock` (Import adds the good rows and their opening stock, skips the rest, and says what it did.) | Pass |
| AC-25.6 | `tests/api/test_us25_inventory.py::test_ac_25_6_importing_the_same_file_twice_changes_nothing` (a second import finds every row already there and changes no quantity.) | Pass |
| AC-25.6 | `tests/api/test_us25_inventory.py::test_ac_25_6_a_row_for_an_existing_item_updates_it_and_ignores_opening_stock` (an existing code (or name) is updated; its quantity stays; the check says opening stock is ignored.) | Pass |
| AC-25.6 | `tests/api/test_us25_inventory.py::test_ac_25_6_a_bad_file_is_refused_as_a_whole` (an empty file, no name column, too many rows or too big a file is refused with a reason.) | Pass |
| AC-25.6 | `tests/api/test_us25_inventory.py::test_ac_25_6_the_import_of_a_stopped_item_leaves_it_stopped` (an import updates the details of a stopped item without bringing it back.) | Pass |
| AC-25.6 | `tests/us25-inventory.test.js` › AC-25.6: Check lists each row and its problems, Import saves the good ones, and a signal is needed | Pass |
| AC-25.7 | `tests/api/test_us25_inventory.py::test_ac_25_7_stock_in_raises_the_quantity` (stock in adds to the quantity; the move records who, the supplier and the bill.) | Pass |
| AC-25.7 | `tests/us25-inventory.test.js` › AC-25.7: stock in adds to the quantity, checks the date and the quantity, and appears in the history | Pass |
| AC-25.8 | `tests/api/test_us25_inventory.py::test_ac_25_8_stock_out_is_refused_when_it_is_more_than_is_in_stock` (a manual stock out can't take the quantity below zero; the message says what is in stock.) | Pass |
| AC-25.8 | `tests/us25-inventory.test.js` › AC-25.8: stock out needs a reason, refuses more than is in stock, and points to the job screen for parts | Pass |
| AC-25.9 | `tests/api/test_us25_inventory.py::test_ac_25_9_a_count_records_the_difference_worked_out_by_the_server` (the phone says what is on the shelf; the server records the correction against its own number.) | Pass |
| AC-25.9 | `tests/us25-inventory.test.js` › AC-25.9: a count shows the difference before saving, records a correction, and saves nothing when it matches | Pass |
| AC-25.10 | `tests/api/test_us25_inventory.py::test_ac_25_10_a_stock_move_cannot_be_changed` (once saved a move is final; a mistake is fixed with a new move.) | Pass |
| AC-25.10 | `tests/us25-inventory.test.js` › AC-25.10: an item's history lists every move newest first with who, the job and the quantity after, and has no way to edit one | Pass |
| AC-25.11 | `tests/api/test_us25_inventory.py::test_ac_25_11_parts_taken_for_a_job_leave_stock_and_show_on_the_job` (the quantity falls, the job lists the part and its history says who used it.) | Pass |
| AC-25.11 | `tests/api/test_us25_inventory.py::test_ac_25_11_using_more_than_is_in_stock_is_allowed_and_shows_as_short` (a job can use what the records say is not there; the item then shows as short.) | Pass |
| AC-25.11 | `tests/api/test_us25_inventory.py::test_ac_25_11_a_closed_job_or_an_unknown_job_takes_no_parts` (a closed job's parts can't change; a job the server doesn't have is refused.) | Pass |
| AC-25.11 | `tests/us25-inventory.test.js` › AC-25.11: taking a part from inventory lowers the stock, lists the part on the job and says so in its history | Pass |
| AC-25.11 | `tests/us25-inventory.test.js` › AC-25.11: more than is in stock is allowed with a warning and shows as short; a closed job takes no parts | Pass |
| AC-25.12 | `tests/us25-inventory.test.js` › AC-25.12: parts named in the note are offered by name with no AI, and nothing is taken until Take is pressed | Pass |
| AC-25.13 | `tests/us25-inventory.test.js` › AC-25.13: the parts a job used become lines on its quote and invoice, after the work lines and still editable | Pass |
| AC-25.13 | `tests/us25-inventory.test.js` › AC-25.13: a part the job already charges for is not added a second time | Pass |
| AC-25.14 | `tests/api/test_us25_inventory.py::test_ac_25_14_a_move_sent_twice_is_applied_once` (a lost answer and a retry (the same operation id) change the quantity once.) | Pass |
| AC-25.14 | `tests/api/test_us25_inventory.py::test_ac_25_14_two_phones_using_the_last_unit_are_both_counted` (both uses count; the item shows as short by one instead of one phone's work being lost.) | Pass |
| AC-25.14 | `tests/us25-inventory.test.js` › AC-25.14: with no signal a part is taken at once, counted as waiting, and sent once when the signal returns | Pass |
| AC-25.14 | `tests/us25-inventory.test.js` › AC-25.14: an answer lost on the way, sent again, changes the stock once | Pass |
| AC-25.14 | `tests/us25-inventory.test.js` › AC-25.14: opening stock for a new item is sent as the item and then a move, in that order | Pass |
| AC-25.15 | `tests/api/test_us25_inventory.py::test_ac_25_15_the_server_owns_the_quantity_and_the_jobs_parts` (a phone can't write the quantity, a job's list of parts or its history through the job.) | Pass |
| AC-25.15 | `tests/api/test_us25_inventory.py::test_ac_25_15_a_move_for_something_that_is_not_there_is_refused` (an unknown item, an unknown kind and a move that is not an object are refused, nothing changes.) | Pass |
| AC-25.15 | `tests/us25-inventory.test.js` › AC-25.15: the quantity is the server\'s: this phone sends moves and never a quantity, and a refused move is taken back | Pass |
| AC-25.15 | `tests/us25-inventory.test.js` › AC-25.15: editing an item sends the item but never counts a changed quantity as an edit | Pass |
| AC-25.16 | `tests/api/test_us25_inventory.py::test_ac_25_16_one_business_cannot_read_or_use_anothers_inventory` (items, moves, jobs and codes of one business are invisible and unusable from another.) | Pass |
| AC-25.16 | `tests/api/test_us23_business_data.py::test_ac_23_2_on_a_real_postgres_a_scoped_session_sees_only_its_own_business` (extended to `item_codes`: a scoped session sees only its business's codes, cannot write another's, and the same code can exist in two businesses; needs `KARYAHUB_TEST_POSTGRES_URL`, run on PostgreSQL 16.2.) | Pass (skipped without the database) |
| AC-25.17 | `tests/api/test_us25_inventory.py::test_ac_25_17_technicians_have_no_inventory_access_unless_the_owner_gives_it` (by default a technician reads and changes no inventory; the owner can allow one person.) | Pass |
| AC-25.17 | `tests/api/test_us25_inventory.py::test_ac_25_17_cost_prices_reach_only_people_who_manage_inventory` (without manage_inventory the server sends no cost prices, in items or in stock-in moves.) | Pass |
| AC-25.17 | `tests/api/test_us25_inventory.py::test_ac_25_17_the_platform_admin_and_the_demo_business_have_no_inventory` (the platform admin sees no business data; the demo business never syncs.) | Pass |
| AC-25.17 | `tests/api/test_us25_inventory.py::test_ac_25_17_importing_needs_manage_inventory` (a person who can't manage inventory can't import.) | Pass |
| AC-25.17 | `tests/us25-inventory.test.js` › AC-25.17: a technician has no Inventory screen or tab; a person with only view access cannot change anything | Pass |
| AC-25.17 | `tests/us25-inventory.test.js` › AC-25.17: the three permissions exist, are on for the office and off for technicians | Pass |
| AC-25.17 | `tests/us25-inventory.test.js` › AC-25.17: a technician the owner allows to take parts can do so, but still sees no Inventory and no cost prices | Pass |
| AC-25.17 | `tests/us25-inventory.test.js` › AC-25.17: a technician with no inventory permission sees nothing about parts on a job | Pass |
| AC-25.18 | `tests/api/test_us25_inventory.py::test_ac_25_18_inventory_changes_go_in_the_activity_log` (items, stock in, stock out, counts and imports are logged; parts used go in the job's history.) | Pass |
| AC-25.19 | `tests/api/test_us25_inventory.py::test_ac_25_19_jobs_from_before_inventory_load_and_take_parts` (a job saved by v0.6.0 has no list of parts; it works, and the first part creates the list.) | Pass |
| AC-25.19 | `tests/us25-inventory.test.js` › AC-25.19: data saved by v0.6.0 (version 4) loads with no items, keeps its jobs, and nothing is put into stock from their parts text | Pass |
| AC-25.19 | `tests/us25-inventory.test.js` › AC-25.19: the demo business has sample stock labelled as such, which never syncs and has no CSV import | Pass |

## Design checklist
| Check | Result |
|---|---|
| All colours are CSS custom properties, with a designed dark theme via `prefers-color-scheme` and a manual switch | Yes (`src/styles.css`, Settings > Theme) |
| Works from 360px to 1440px with no sideways scrolling | Yes: checked at 375px and 1280px; scroll width equals the viewport on every screen |
| Tap targets at least 44px | Yes: buttons, chips, tabs, radios and links have a 44px minimum height |
| Semantic HTML, labelled fields, visible focus, contrast, reduced motion | Yes: landmarks (header, nav, main, footer), labelled inputs, `:focus-visible` outline, AA colour pairs, `prefers-reduced-motion` turns off animation |
| Plain-English copy; sample data marked | Yes: "Demo" pill, "(demo)" and "(dummy)" labels, "Simulated: nothing was sent" |
| Designed empty, loading and error states | Yes: see DESIGN.md > States and > Additions in CR-0002 (visit plan loading, server unreachable, wrong code) |
| Favicon, title, meta description, Open Graph title and description, theme-color | Yes (`index.html`, `public/favicon.svg`) |
| Inline SVG icons, no emoji | Yes (`src/ui/icons.js`) |
| Footer link "Part of Idea Studio by AkkiVerse" to the hub | Yes |
| Motion: one entrance moment plus action feedback | Yes: processing steps ticking to green; sheet rises; voice-note waveform while playing |

## Visual check
**CR-0011:** the production build served by `vite preview` with `/api` going to the real server (`uv run uvicorn api.index:app`, in-memory database), driven by Playwright in Chromium at 375px and 1280px in light and dark (4 runs, each in a fresh business seeded through the sync call: 9 items with one low, two out or short, one job with a note naming parts; 40 screenshots). Per run: Inventory list (cards on the phone, table on the desktop) with its tiles, search ("cap 45" gave one item, a nonsense word gave the empty message), the Low chip; one item with its history; Stock in with a wrong quantity (the message under the box) and then a right one (the notice, "All saved"); Count with the live "This records −1 nos as a count correction." line; Add item with five field messages; CSV import with 2 new, 1 update and 4 problem rows listed by row number; the job with "From the note" suggestions and an unmatched "copper nut"; taking a part from the picker (the short-stock warning for the stabiliser), then the parts list with prices for the owner. A technician signing in saw Chat and Jobs only, no Inventory tab, and "You don't have access to Inventory" at `#/inventory`. No console errors, and page width equals the viewport in every run. The design mockup (`docs/design/mockups/inventory.html`) was walked through the same way before the build; the built screens follow it.

**CR-0010:** the production build served by `vite preview` with `/api` going to the real server (`uv run uvicorn api.index:app`, in-memory database). `AI_ENDPOINTS` pointed at a local stand-in for the Mac's Ollama that has only `gemma4:e4b`, takes 4 s per JSON read and streams the photo text word by word. `AI_MODEL` was set to `qwen3.5:9b`, a model the stand-in lacks, to exercise the fallback. Playwright in Chromium at 375px light and dark and 1280px light:
- Opening Chat sent one warm-up.
- A typed note showed "Reading the message… 2 s" with Stop, then the draft card, and the message box and Send were on again.
- A second note went straight through.
- The job-sheet photo's text appeared word by word under "Reading…" with a cursor, then became the transcript.
- Stop showed "Stopped. Your message is kept: press Try again to read it again." with Try again.

The server log showed one line per AI call (`AI gemma4:e4b on Main server: answered in 4.0 s`, `AI stream gemma4:e4b … first word 0.3 s`). There were no console errors, and page width equals the viewport. No fixes were needed.

**CR-0009:** the production build served by `vite preview` with `/api` going to the real server (`uv run uvicorn api.index:app`, in-memory database), driven by Playwright in Chromium at 375px and 1280px in light and dark (4 runs, 52 screenshots): sign in as a real business's owner on a fresh browser (the mark says "All saved"), a job typed in Chat and approved (shown as "New", then `J-0001` after the sync), the Jobs list on a second fresh browser showing the same jobs, the browser set offline and a second job approved (the mark says how many changes are waiting and the page stays within the screen), Settings with a logo added (preview, Replace and Remove), Admin with the Add a person button (pressing it stays on Admin and puts the cursor in the name box). Fixes made after looking: the Open link in a chat bubble showed the raw id of a not-yet-numbered job and widened the page on a phone (it now says "Open the job" until the server gives a number), and the sync mark was too wide on a phone and widened the top bar by 2 px (it is now narrower with an ellipsis). Nothing overflows sideways on any screen.

**CR-0005:** the production build served by `vite preview` with `/api` going to the real server (`uv run uvicorn api.index:app`, in-memory database), driven by Playwright in Chromium at 375px and 1280px in light and dark (48 screenshots: sign-in with and without the demo accounts; a real business owner on Home, Chat, Jobs, Renewals, Admin, Settings and My account; the platform admin on Businesses; the demo owner on Home and Admin). No page errors, no console errors, no horizontal overflow. Before that, the same server was walked through with curl: create the platform admin, create a business, the temporary-PIN gate, CSV import with a bad row, isolation between businesses, and the read-only demo. Fixes made after looking: the platform admin's footer said "Sample data only" (it now shows only in the demo business); a real business's Home showed the sales story and a "Sample data" tag (now a "Get started" panel); the activity log showed a raw code for PIN changes and the role table still said "reset the demo" (both reworded); "1 people" and "1 row need fixing" grammar. Not run here: the real Neon database, which is checked on the Vercel preview through `/api/health`.

**CR-0004:** the production build served by `vite preview` with `/api` going to the real server (`uv run uvicorn api.index:app`) and `AI_ENDPOINTS` pointing at a local stand-in for the Ollama server, driven by Playwright in Chromium. Flow: sign in as the owner, Chat, send the job-sheet photo. With AI online, the photo reached the AI as an 80 kB JPEG drawn from the sheet, both steps said "Read by Studio AI (KaryaHub server)" and the card showed "Read by AI" with Sunil Patil's job. With the AI server off (a second server whose `AI_ENDPOINTS` answers nothing), both steps said "Read without AI (KaryaHub server)", the processing note and the banner showed, and the card showed "Read without AI" with the draft ready to approve. Checked at 375px and 1280px in light and dark: no console errors, page width equals the viewport. No fixes were needed.

**CR-0003:** the production build served by `vite preview`, driven by Playwright in Chromium at 375px and 1280px in light and dark: Sign in (desktop split screen and phone), sign in as the owner, Home with the "Today at" row, Jobs, Admin (full page), then a technician's Chat and the no-access page for Renewals. Page width equals the viewport on every screen. Fixes made after looking: the footer overlapped the last demo account on the desktop sign-in page (moved into the form column); the no-access heading was grey and oversized (now ink colour, 1.4rem); avatar initials were low-contrast on the lighter dark-theme colours (dark text in dark theme). Also removed the focus box drawn around page headings when focus moves to them by script (keyboard focus still shows).

**CR-0002:** the production build served by `vite preview` with `/api` proxied to `uv run uvicorn api.index:app` (the real server, mock mode), driven by Playwright in Chromium at 375px and 1280px wide in light and dark: Chat (voice note, steps say "KaryaHub server"), Approve, job screen with Proof of work and AMC service visits, Send code, enter the code, Verify, Close, and Settings (connected to API v0.2.0). No console errors; page width equals the viewport on every screen. Fix made after looking: the third mode radio button shrank when its label wrapped on phones; radios no longer shrink.

**CR-0001:** Headless Chromium (Playwright) against `vite preview` of the production build. Screens: Home, Chat (after a voice note, a photo, edit mode and a simulated failure), Document (invoice), Renewals (with the reminder preview) and Settings, each at 375px and 1280px wide in light and dark. No console errors and no horizontal overflow.

Fixes made after looking at the screenshots:
- The chat thread did not stay scrolled to the newest message while steps updated; it now keeps the bottom in view unless the viewer has scrolled up.
- The "Simulate failure" switch wrapped onto its own line on phones; the label now sits beside the checkbox.
- Moving between screens now starts at the top of the page.

## Releases
- v0.7.0 (planned): CR-0011 in review; 289 of 289 tests passing (151 server, 138 web), plus the Postgres-only test (run on PostgreSQL 16.2).
- v0.6.0 (2026-11-01): CR-0010 released; 231 of 231 tests passing (122 server, 109 web), plus the Postgres-only test (skipped here). Founder checked the preview: two notes in a row, Stop and Try again; AI reads took 0.8 to 4.4 s (runtime logs).
- v0.5.0 (planned): CR-0009 in review; 209 of 209 tests passing (110 server, 99 web), plus the Postgres-only test.
- v0.1.0 (2026-10-28): CR-0001 released; 23 of 23 acceptance tests passing.
- v0.2.0 (2026-10-28): CR-0002 and CR-0003 released; 75 of 75 acceptance tests passing.
- v0.3.0 (2026-10-30): CR-0004 released; 87 of 87 acceptance tests passing.
- v0.5.0 (2026-10-31): CR-0009 released; 209 of 209 tests passing (110 server, 99 web), plus the Postgres-only test on PostgreSQL 16.2.
- v0.4.3 (2026-10-30): CR-0008 released; 170 of 170 tests passing (the kit's own new tests are in the hub repository).
- v0.4.2 (2026-10-30): CR-0007 released; 170 of 170 tests passing (82 server, 88 web).
- v0.4.1 (2026-10-30): CR-0006 released; 165 of 165 tests passing (78 server, 87 web).
- v0.4.0 (2026-10-30): CR-0005 released; 161 of 161 tests passing. Live check: `/api/health` reports `database: ok`, the demo owner signs in, the demo team is read-only, and the AI read answers.
