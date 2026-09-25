# Sources

- Claude Code best practices, "Write an effective CLAUDE.md": keep persistent context short, include what Claude cannot infer from the code (commands, non-obvious gotchas, project-specific decisions), exclude what it can figure out by reading code or what changes often, and for each line ask "Would removing this cause Claude to make mistakes?": https://code.claude.com/docs/en/best-practices
- Google SRE book, "Postmortem Culture: Learning from Failure": a postmortem records what happened, its causes and the follow-up actions to prevent recurrence, and "must focus on identifying the contributing causes of the incident without indicting any individual or team": https://sre.google/sre-book/postmortem-culture/
- Martin Fowler on Eric Evans' Ubiquitous Language: "a common, rigorous language between developers and users", rigorous because "software doesn't cope well with ambiguity" (why proposed terms need a precise, one-sentence definition): https://martinfowler.com/bliki/UbiquitousLanguage.html
- Anthropic, "Effective context engineering for AI agents": the smallest set of high-signal tokens (why proposals are capped and often empty): https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

Researched 2026-09-25.
