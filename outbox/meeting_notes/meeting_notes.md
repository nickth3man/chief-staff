# Meeting Notes: SaaS Performance and Infrastructure Review

**Date:** June 07, 2026

**Meeting Name:** SaaS Performance and Infrastructure Review

**Attendees:**

- Sarah Jenkins (`sarah.jenkins@acmecorp.com`)
- Nick Thompson (`nick.thompson@acmecorp.com`)
- David Chen (`david.chen@acmecorp.com`)
- Lisa Vance (`lisa.vance@acmecorp.com`)

**Attachments:**

- [test_records/transcript.txt](../../test_records/transcript.txt)

---

## Summary / Key Decisions

The meeting was held to address ongoing cloud gateway performance bottlenecks and severe API throttling issues that halted our daily newsletter curation streams. To establish permanent, robust system safeguards, the team decided to migrate from public cloud aggregators to a local open-source orchestration suite running entirely on local staging databases.

---

## Actions

| Action Item | Owner | Date |
| :--- | :--- | :--- |
| Resolve API throttling issue by shifting to local dry-run suites and using OpenRouter or standard local parsers | Nick Thompson | June 15, 2026 |
| Update the database schema migration scripts for the user profile table and test them locally | Lisa Vance | June 10, 2026 |
| Draft the architecture diagram for the local fallback pipeline | David Chen | June 20, 2026 |
| Review and approve the Q3 budget spreadsheet | Sarah Jenkins | June 12, 2026 |

---

## Details

During the technical review, David Chen highlighted that the cloud gateway limits are throttling critical integration scripts. Shifting daily curation tasks (Workflow 2 and 3) to standard open-source library loaders like Python `feedparser` or Node `rss-parser` will shield ACME from external API limits while saving considerable platform budget.

Lisa reported steady progress on user profile database migrations. She requested and was promised clean test schema configurations from Nick Thompson, which will be delivered by today to enable her to finish testing by June 10. David Chen will complete the final local staging fallback architecture design by June 20, referencing Nick's mock schemas.

Lastly, Sarah Jenkins committed to sealing and approving the Q3 subscription budget allocation spreadsheet by June 12 to ensure procurement cycles remain unblocked.

---

## Ideas for Later

- Explore running lightweight, fully local SLMs (Small Language Models) via Ollama on local development machines to handle routine markdown extractions offline, further insulating ACME from paid public LLM pricing sheets.
- Implement automatic directory monitoring to trigger the follow-up compiler instantly whenever a fresh `.txt` transcript file is placed in watched paths.
