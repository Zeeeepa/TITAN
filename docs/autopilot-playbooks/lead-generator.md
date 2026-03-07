# Lead Generator Playbook

Copy this into `~/.titan/AUTOPILOT.md` for automated lead discovery and scoring.

---

## Prerequisites

No special configuration needed. Uses DuckDuckGo for discovery (no API keys).

Optionally configure email in `~/.titan/titan.json` for digest reports.

---

## AUTOPILOT.md Template

```markdown
# Lead Generation Pipeline

## Every 6 Hours

- [ ] Scan Reddit for leads using lead_scan with query matching my services (e.g., "automation developer", "AI bot builder")
- [ ] Scan HackerNews for leads using lead_scan with platform="hackernews"
- [ ] Score each result using lead_score
- [ ] Save leads with score >= 5 to the queue using lead_queue with action="add"
- [ ] For leads with score >= 8, draft a response or outreach message

## Daily Digest

- [ ] Generate a lead report using lead_report with period="day"
- [ ] Send the report via email_send if email is configured
- [ ] Update any stale leads (older than 7 days with status="new") to "dismissed"

## Weekly Review

- [ ] Generate weekly report using lead_report with period="week"
- [ ] Review conversion rate (leads contacted vs converted)
- [ ] Adjust search queries based on what's working
- [ ] Log any income from converted leads using income_log
```
