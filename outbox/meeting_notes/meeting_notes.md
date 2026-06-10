# Latest Meeting: SaaS Performance and Infrastructure Review

_Per-meeting file: ..\assets\meeting-documents\saas-performance-and-infrastructure-review-20260602095735.md_

- **API Throttling:** The team's cloud gateway was flagged for hitting provider-imposed rate limits, stalling the daily newsletter curation pipeline. The group agreed to migrate workflows to a **local-first dry-run suite** using self-managed endpoints (e.g., OpenRouter or standard local parsers) to eliminate cloud gateway dependencies and reduce API budget.
- **Database Migration:** Schema migration scripts for user profile tables are being updated to support **local CSV tracking files**, with a full local validation cycle required before rollout.
- **Local Fallback Pipeline:** An architecture diagram is needed so the engineering team can properly structure fallback connectors once the local fallback pipeline is in place.
- **Q3 Budget:** Sarah will review and approve the updated SaaS subscription allocations to unblock the procurement team.
- **Offline Document Staging:** The team agreed that local dry-runs should be made fully autonomous by having scripts automatically write parsed outputs to designated local paths.
