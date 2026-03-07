# TITAN Autopilot Playbooks

Pre-built autopilot templates for autonomous income generation. Copy the relevant sections into your `~/.titan/AUTOPILOT.md` file.

## Available Playbooks

| Playbook | Strategy | Frequency |
|----------|----------|-----------|
| [freelance-monitor.md](freelance-monitor.md) | Search jobs, match profile, draft proposals | Daily |
| [content-publisher.md](content-publisher.md) | Research trends, write articles, publish to blog | Daily |
| [lead-generator.md](lead-generator.md) | Scan Reddit/forums, score leads, email digest | Every 6 hours |
| [service-automator.md](service-automator.md) | Triage inbox, process requests, send updates | Hourly |

## Setup

1. Choose a playbook that matches your strategy
2. Copy its contents into `~/.titan/AUTOPILOT.md`
3. Customize the variables (skills, platforms, repos, etc.)
4. Set TITAN to autopilot mode: `titan autopilot start`

## Required Configuration

- **Freelance Monitor**: Create `~/.titan/freelance-profile.json` with your skills and rates
- **Content Publisher**: Set `GITHUB_TOKEN` env var for publishing to GitHub repos
- **Lead Generator**: No special config needed (uses DuckDuckGo)
- **Service Automator**: Configure email credentials in `~/.titan/titan.json`

## Income Tracking

All playbooks can log earnings via the `income_tracker` skill. Add this to any playbook:

```
- [ ] After completing paid work, log the income using income_log
- [ ] At end of day, check income_goal progress
```
