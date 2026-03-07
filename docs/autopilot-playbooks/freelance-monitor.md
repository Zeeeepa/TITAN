# Freelance Monitor Playbook

Copy this into `~/.titan/AUTOPILOT.md` to run daily freelance job monitoring.

---

## Prerequisites

Create `~/.titan/freelance-profile.json`:
```json
{
  "name": "Your Name",
  "title": "Full Stack Developer",
  "skills": ["Node.js", "TypeScript", "React", "Python", "API Development"],
  "hourlyRate": 100,
  "bio": "Experienced developer specializing in automation and AI integration",
  "experience": ["Built enterprise APIs for Fortune 500", "10+ years in web development"],
  "portfolio": ["https://github.com/yourname/project1"]
}
```

---

## AUTOPILOT.md Template

```markdown
# Freelance Job Monitor

## Daily Tasks (run every morning)

- [ ] Search Upwork for jobs matching my skills using freelance_search with query from my profile skills
- [ ] Search Fiverr for relevant gigs using freelance_search
- [ ] For each promising result (budget > $500), score it using freelance_match
- [ ] Save leads with score >= 6 using freelance_track with action="add"
- [ ] For top 3 leads (score >= 8), generate proposal outlines using freelance_draft
- [ ] Log any leads to the freelance tracker with status tracking

## Weekly Review (every Sunday)

- [ ] Review all tracked leads using freelance_track with action="list"
- [ ] Update statuses for leads I've applied to
- [ ] Check income_summary for the week
- [ ] Check income_goal progress for the month
```
