# Sources

- Claude Code best practices — "Explore first, then plan, then code" and "Let Claude interview you" (a self-contained spec names the files and interfaces involved, states what is out of scope, and ends with an end-to-end verification step), and skip the plan when the diff fits in one sentence (the `lighten` verdict): https://code.claude.com/docs/en/best-practices
- Claude Code best practices — "Give Claude a way to verify its work" (acceptance criteria as checks that return pass or fail; verify UI changes visually): https://code.claude.com/docs/en/best-practices
- Anthropic, "Effective context engineering for AI agents" — examples over exhaustive rules; the smallest set of high-signal tokens: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Google engineering practices, "Small CLs" — one self-contained change per review, and how to split: https://google.github.io/eng-practices/review/developer/small-cls.html
- Anthropic, "Harness design for long-running application development" — the planner stays on product context and high-level design, since a wrong granular detail in the spec cascades into the implementation: https://www.anthropic.com/engineering/harness-design-long-running-apps
- GitHub Spec Kit, "Specification-Driven Development" — the spec focuses on what users need and why, and avoids how to implement: https://github.com/github/spec-kit/blob/main/spec-driven.md
- Kiro, "Bugfix Specs" — next to the current and expected behaviour, record the unchanged behaviour that must keep working, to prevent regressions: https://kiro.dev/docs/specs/bugfix-specs/
- Anthropic, "Effective harnesses for long-running agents" — verify features end to end, testing as a human user would: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Birgitta Böckeler, "Understanding Spec-Driven-Development: Kiro, spec-kit, and Tessl" — a small bug turned into 4 user stories with 16 acceptance criteria; spec markdown that is verbose and tedious to review: https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html

Researched 2026-09-26.
