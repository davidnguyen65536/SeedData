# Use of AI tools

NASA Space Apps asks teams to say where AI tools were used. The project idea and the decisions about scope, data and scoring are the team's own; AI was used to speed up the build.

| Where | Tool | How it was used |
| --- | --- | --- |
| Pipelines (`pipelines/`), web app (`app/`), API (`api/`), tests, docs | Claude (Anthropic) | Drafted code and documentation from the team's design; the team reviews, tests and edits it. Files are marked in this table rather than one by one. |
| In the app ("Why this score?" and the Story tab's "Write it with AI") | Claude via the Anthropic API (optional) | Writes the wording of explanations using numbered placeholders only. A deterministic checker rejects any number that is not from the paddock's facts. Without an API key, fixed rules write the wording. |

- No AI-generated images, video or audio are used. If any are added, they will carry a visible "AI-generated" watermark.
- No NASA logos or branding are used in generated content.
