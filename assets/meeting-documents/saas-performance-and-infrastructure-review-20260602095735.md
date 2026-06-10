# Meeting Notes: SaaS Performance and Infrastructure Review
**Date:** 2026-06-02

**Meeting Name:** SaaS Performance and Infrastructure Review

**Attendees:**
- Sarah Jenkins (sarah.jenkins@acmecorp.com)
- Nick Thompson (nick.thompson@acmecorp.com)
- David Chen (david.chen@acmecorp.com)
- Lisa Vance (lisa.vance@acmecorp.com)

**Attachments:**
- test_records/transcript.txt

---

## Summary / Key Decisions
- **API Throttling:** The team's cloud gateway was flagged for hitting provider-imposed rate limits, stalling the daily newsletter curation pipeline. The group agreed to migrate workflows to a **local-first dry-run suite** using self-managed endpoints (e.g., OpenRouter or standard local parsers) to eliminate cloud gateway dependencies and reduce API budget.
- **Database Migration:** Schema migration scripts for user profile tables are being updated to support **local CSV tracking files**, with a full local validation cycle required before rollout.
- **Local Fallback Pipeline:** An architecture diagram is needed so the engineering team can properly structure fallback connectors once the local fallback pipeline is in place.
- **Q3 Budget:** Sarah will review and approve the updated SaaS subscription allocations to unblock the procurement team.
- **Offline Document Staging:** The team agreed that local dry-runs should be made fully autonomous by having scripts automatically write parsed outputs to designated local paths.

## Actions
| Action Item | Owner | Date |
| :--- | :--- | :--- |
| Resolve API throttling by configuring local dry-run suites (python-feedparser / rss-parser) and mapping existing configuration structures | Nick Thompson | June 15, 2026 |
| Update database schema migration scripts for user profile tables and complete full local validation cycle | Lisa Vance | June 10, 2026 |
| Supply mock CSV headers for outbox context databases, tasks, and kanban cards to David | Nick Thompson | June 6, 2026 (today per transcript) |
| Draft architecture diagram for the local fallback pipeline (incorporating Nick's outbox data) | David Chen | June 20, 2026 |
| Review and approve Q3 budget spreadsheet (SaaS subscription allocations) | Sarah Jenkins | June 12, 2026 |

## Details
**API Throttling Issue:**
David identified that the cloud provider capped the team's tier, causing rate-limit failures. Nick confirmed he is already configuring local suites to pull feeds via `python-feedparser` or `rss-parser`, removing reliance on third-party cloud aggregators. The target completion date is **June 15, 2026**. Nick will also map out all existing configuration structures as part of this work.

**Database Schema Migration:**
Lisa has the structure mostly complete for user profile table migrations to support local CSV tracking. She needs to run a full local validation cycle before finalizing. Target completion is **June 10, 2026**.

**Architecture Diagram:**
David will draft the architecture diagram for the local fallback pipeline, targeting **June 20, 2026**. Nick will provide the necessary mock CSV headers for outbox context databases, tasks, and kanban cards ahead of this deadline.

**Q3 Budget:**
Sarah will personally review and approve the updated Q3 SaaS subscription allocations by **June 12, 2026**, which will unblock the procurement team. Nick will log this as a formal action item.

**Offline Document Staging:**
David proposed that local dry-run scripts should automatically write parsed outputs to `outbox/meeting_notes/meeting_notes.md` and `outbox/drafts/email_draft.txt`. Lisa agreed this would make local dry-runs completely autonomous. The group agreed to capture all items in their trackers immediately.

## Ideas for Later
- **Fully autonomous offline document staging:** Build out dedicated scripts that automatically generate and write parsed meeting notes (`outbox/meeting_notes/meeting_notes.md`) and email drafts (`outbox/drafts/email_draft.txt`) during local dry-runs, making the entire local workflow self-contained without manual intervention.