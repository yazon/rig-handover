---
name: plan-to-issues
description: Split this repo's plan.md into GitHub issues with gh, one per unit of work, after a human has reviewed the split. Use when a plan is ready and has no issues yet.
---

# plan-to-issues

Turns `plan.md` into GitHub issues that workers can pick up cold. Easiest with `gh`, authenticated,
in a shell this agent can run.

## Steps

1. Read `plan.md`, `AGENTS.md` and `docs/adr/`.
2. Draft the split as a table: title · plan section · scope · done when · blocked by.
   One issue per unit of work.
3. **Stop and show the table to the human.** Publish nothing until they approve it.
4. Every issue carries what "What every issue carries" below says. Ask the human only for
   anything this plan needs beyond it.
5. Create each issue in dependency order, so blocked-by can cite real numbers:

   ```sh
   gh issue create --title "<title>" --label "plan:<plan>" --body-file <tmp.md>
   ```

6. Record every issue URL from gh's output (not from memory) and reply with the list.

Closing one, with the closing comment from AGENTS.md:

```sh
gh issue close <n> -c "<closing comment>"
```

## What every issue carries

The reviewer sorts issues by their first line and their label; a human approved the rest
(morning-digest, 2026-10-30).

- Label `plan:<plan>`, the `plan:` value from `plan.md`'s frontmatter (e.g. `plan:morning-digest`).
  Create it once per plan: `gh label create "plan:<plan>"`.
- The body, in this order:

  ```md
  Source: plan.md § <n>

  **Scope:** <the section's work, in the plan's words>

  **Done when:** <the section's "Done when", word for word>

  **Blocked by:** #<n> (<what it needs from it>), or —
  ```

  `<n>` is the section as the plan numbers it: `1`, `2a`, `3`.
- A step that ends by handing something to someone (a preview to a reviewer) is done when they
  have it and say so, not when it is sent. Its issue stays open until then (AGENTS.md, step 5).

## No `gh`

Steps 1–4 hold either way. GitHub reachable another way (a connector, the REST API, the web UI):
the same issues, made that way. GitHub issues out of reach altogether: write them as files in
`docs/issues/`, format in ADR 0004, then commit and push.

## Don'ts

- Don't paste the whole plan into one issue, and don't keep issues only in chat.
- Don't invent sections the plan doesn't have. If the plan is unclear, ask.
