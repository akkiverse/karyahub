# Changelog

All notable changes to KaryaHub are recorded here. Each entry links to its change request, which explains why.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- KaryaHub server (Python, FastAPI) under `/api`: processing pipeline, secure WhatsApp Cloud API webhook, job workflow with customer one-time codes, AMC visit planner, GST totals and reminder text. See [CR-0002](docs/changes/CR-0002-advance-tech.md).
- Proof of work on every job: send the customer a code, verify, close, with a history of each step. See [CR-0002](docs/changes/CR-0002-advance-tech.md).
- AMC service visits on the job screen: next visit, overdue escalation, job creation 7 days ahead. See [CR-0002](docs/changes/CR-0002-advance-tech.md).
- Architecture documents: HLD, LLD, risks and challenges, and a review of the reference platform. See [CR-0002](docs/changes/CR-0002-advance-tech.md).

### Changed
- Chat is processed by the KaryaHub server by default, falling back to the in-browser demo if the server can't be reached; Settings shows where messages are processed and the server's status. See [CR-0002](docs/changes/CR-0002-advance-tech.md).
- Saved demo data is upgraded automatically (data version 2); nothing is lost. See [CR-0002](docs/changes/CR-0002-advance-tech.md).

## [0.1.0] - 2026-10-28

### Added
- First version (MVP), a key-free demo prototype built from the approved spec. See [CR-0001](docs/changes/CR-0001-mvp.md).
  - Home explains the problem and shows the money at stake in the next 90 days.
  - Chat simulates a WhatsApp thread: two sample voice notes, a job-sheet photo or free text become a job summary the owner can edit and approve, with each processing step visible.
  - Quotations and GST-format invoices (CGST 9% + SGST 9%) with a DEMO watermark and print-to-PDF.
  - Renewals by 30, 60 or 90 days or lapsed, with a preview of the customer's WhatsApp reminder.
  - Settings with demo mode, each service's status and key, a failure simulator, theme and Reset demo.
