# Service Automator Playbook

Copy this into `~/.titan/AUTOPILOT.md` for automated client service delivery.

---

## Prerequisites

- Configure email credentials in `~/.titan/titan.json`
- Set up cron jobs for recurring client tasks
- Create client-specific templates in `~/.titan/workspace/`

---

## AUTOPILOT.md Template

```markdown
# Service Automation Pipeline

## Hourly Tasks

- [ ] Check email inbox for new client requests using email_search
- [ ] Triage messages: categorize by urgency (high/medium/low)
- [ ] For high-urgency requests, draft a response immediately
- [ ] For routine requests, queue them for batch processing

## Every 4 Hours

- [ ] Process queued client requests
- [ ] Run any scheduled reports or data pulls for clients
- [ ] Send status updates to clients with active projects via email_send
- [ ] Log completed billable work using income_log

## Daily Tasks

- [ ] Review all client communications from today
- [ ] Update project status tracking
- [ ] Send end-of-day summary to clients with deliverables
- [ ] Check income_summary for the day
- [ ] Back up any client deliverables to GitHub using github_files

## Weekly Tasks

- [ ] Generate weekly client reports
- [ ] Invoice clients for completed work (draft via email)
- [ ] Check income_goal progress for the month
- [ ] Review automation efficiency — are there repetitive tasks to automate further?

## Monthly Tasks

- [ ] Generate monthly income report using income_summary with period="month"
- [ ] Review client retention and satisfaction
- [ ] Identify upsell opportunities for existing clients
- [ ] Adjust service offerings based on demand
```
