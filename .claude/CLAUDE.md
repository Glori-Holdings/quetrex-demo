# Learning

When I correct you or you catch yourself making a mistake, before continuing, add the lesson as a one-line rule under #LESSONS so it never happens again.

# LESSONS

(Place Lessons Here)

## Verification
Run in this order — all must pass before any PR:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Quetrex

This is a Quetrex project — features go through `/quetrex:task-build`, and the guarded pipeline (architect → developers → QA → reviewer → git-workflow) carries each task to a reviewed, merged PR.
