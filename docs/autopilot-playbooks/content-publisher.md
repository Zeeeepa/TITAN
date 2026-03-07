# Content Publisher Playbook

Copy this into `~/.titan/AUTOPILOT.md` for automated SEO content publishing.

---

## Prerequisites

- Set `GITHUB_TOKEN` or `GH_TOKEN` environment variable
- Create a GitHub repo with GitHub Pages enabled (Jekyll or Hugo)
- Configure the repo name below

---

## AUTOPILOT.md Template

```markdown
# Content Publishing Pipeline

## Daily Tasks

- [ ] Research trending topics in "AI agents" using content_research with type="trends"
- [ ] Check if a new article was published in the last 3 days (skip if yes)
- [ ] Generate an article outline using content_outline based on top research result
- [ ] Write a 1000-word article based on the outline
- [ ] Publish the article to owner/blog-repo using content_publish
- [ ] Log the publication as income if the blog is monetized using income_log

## Weekly Tasks

- [ ] Research competitor content using content_research with type="competitors"
- [ ] Identify content gaps using content_research with type="gaps"
- [ ] Plan next week's content calendar
- [ ] Review content_schedule and adjust if needed

## Monthly Review

- [ ] Check income_summary for content-related income
- [ ] Review which articles drove the most traffic
- [ ] Update content strategy based on performance
```
