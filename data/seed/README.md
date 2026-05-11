# Seed knowledge bases

Each subfolder is one demo user's KB. Drop `.md` or `.txt` files here and run `npm run seed` to ingest them.

- `ai-and-the-programmer/` → User A (alice@demo.local). Theme: how AI tools change the craft of programming.
- `developer-mind/` → User B (bob@demo.local). Theme: imposter syndrome, burnout, and identity for engineers.

## File format

- Plain Markdown or text.
- The first `# Heading` becomes the document title (otherwise the filename is used).
- One file = one document.
- Aim for ≥20 docs or ≥50k tokens per KB (per the assignment spec).

## Suggested sources to fetch (public)

For **AI & the Programmer** (User A):
- Simon Willison's blog posts about LLMs, prompt engineering, agents
- Andrej Karpathy talks/notes ("Software 2.0", "Software 3.0")
- Steve Yegge's recent posts about AI-assisted development
- Geoffrey Litt's essays on malleable software
- Anthropic engineering posts about Claude Code

For **Developer Mind** (User B):
- Julia Evans posts on debugging mindset & learning in public
- Dan Luu essays on senior engineering and career
- Will Larson's writing on staff-eng career paths
- Charity Majors on burnout and ops culture
- Top r/cscareerquestions threads on imposter syndrome

You're welcome to swap themes entirely — just keep the two KBs visibly different so the demo
showcases per-user isolation.
