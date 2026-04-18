# MCPConnect - Demo Script

**Target length:** ~8 minutes
**Tone:** Conversational, developer-to-developer

> **Format:** `[SCREEN/ACTION]` describes what to click or navigate to. The quoted text is what to say.

---

## INTRO (30 sec)

**[Start on a blank browser, no app visible]**

> "If you've been using Claude or any AI assistant, you've probably hit the same wall - Claude is great at reasoning, but getting it to actually *do* things with your existing tools requires a lot of wiring. MCPConnect is an open-source, self-hosted MCP server that turns any REST API into a tool Claude can call. No custom code, no per-task billing - you own everything. Let me show you how it works."

---

## DASHBOARD (45 sec)

**[Navigate to the app, land on Dashboard]**

> "This is the dashboard. At a glance you can see how many integrations are connected, how many tools are registered, and whether any external MCP servers are linked in."

**[Point to the Getting Started checklist]**

> "The flow is simple - connect an integration, define some tools, and your AI assistant can start calling real APIs. Let's walk through that."

---

## INTEGRATIONS (2 min)

**[Click Integrations in the sidebar]**

> "Integrations are your API connections. Each integration points to a base URL and holds the authentication config - so your credentials live in one place, not scattered across individual tools."

**[Click "+ Add Integration"]**

> "Let's connect to Jira. I'll pick the type, give it a name, paste the base URL, and choose Bearer Token auth."

**[Fill in: Name = "Jira", Type = custom, Base URL = your Jira instance, Auth = Bearer Token, paste token]**

> "The token stays encrypted on the server. Tools built on this integration inherit the auth automatically - you never put credentials in a tool definition."

**[Save and close the modal]**

> "Now here's something useful for teams."

**[Click the Share icon on the integration]**

> "I can mark this integration as Shared. That means the integration config is visible to everyone, but each team member connects with *their own* token. Admin sets it up once, everyone uses their own credentials."

---

## DISCOVER API / TOOLS (2 min)

**[Click "Discover API" button]**

> "Instead of creating tools one by one, I can point MCPConnect at an OpenAPI spec and it'll import all the endpoints automatically."

**[Paste your Jira or any OpenAPI base URL, click Discover]**

> "It fetches the spec, parses every endpoint, and shows me a list. I pick the ones I want."

**[Check a few endpoints - e.g. Get Issue, Add Comment, Get Transitions - click Import]**

> "Done. Those are now registered as callable tools. Let me show you what a tool actually looks like."

**[Navigate to the Jira integration's tools page, click Edit on one tool]**

> "Each tool has a name, description, the HTTP method and path, and a parameter schema. This schema is exactly what Claude sees - it knows what inputs to ask for and what they mean."

**[Show the body template section for a POST tool]**

> "For POST endpoints, you define a body template. Curly-brace placeholders get substituted at call time with whatever Claude passes in. You can also test the tool right here."

**[Click Run on a tool, fill in a parameter, execute]**

> "You can see the exact request that goes out and the raw response. Useful for debugging before you ever involve an AI."

---

## COMPOSITE TOOLS (1.5 min)

**[Navigate to a tools page, scroll to Composite Tools section, click "+ New Composite Tool"]**

> "Composite tools are where it gets interesting. Instead of Claude making three separate calls and you having to explain the sequence every time, you chain them into a single tool with one name."

**[In the builder, add 3 steps: Get Issue → Add Comment → Transition Status]**

> "Step one fetches the Jira issue. Step two adds a comment - and I can map the issue ID from step one directly into step two's input. Step three transitions the status."

**[Drag a field from the right panel into a step's input mapping]**

> "Drag-and-drop mapping. Output from one step becomes input to the next. Claude just calls `update-jira-issue` with a ticket ID and MCPConnect handles the whole chain."

**[Click Save]**

> "One tool call. Three API calls. Claude doesn't need to know the sequence - you've encoded the workflow."

---

## SKILLS (1 min)

**[Navigate to Skills]**

> "Skills are a layer above tools. If tools are the *actions*, skills are the *playbooks* - reusable prompt templates that tell Claude exactly what to do and in what order."

**[Click on an existing skill or create a new one]**

> "A skill has a name, a description, optional input variables, and a prompt template. When someone calls `list-skills` from their AI assistant, they get a catalogue. When they call `get-skill`, they get the full content ready to install."

**[Show the install instructions in the skill detail]**

> "Any AI tool - Claude, Cursor, Windsurf - can discover and install skills over MCP. The installation instructions are written generically so every client can follow them."

---

## MONITORING (45 sec)

**[Navigate to Monitoring]**

> "Every tool call is logged. Success rate, response times, which tools are most used - it's all here."

**[Click to expand a call row]**

> "Click any row to see the exact request that went out and the exact response that came back. You can replay a call to retest it, or open it in the tool tester to modify the inputs."

> "If something breaks in production, the answer is in this log."

---

## CONNECT TO CLAUDE (45 sec)

**[Go to Settings → MCP Server tab]**

> "Finally - connecting this to your AI assistant. MCPConnect exposes a standard MCP endpoint. You paste this config into Claude's settings and every tool you've defined shows up automatically."

**[Show the Claude config snippet]**

> "One config entry. All your integrations, all your tools, composite workflows, skills - available to Claude in every session. No copy-pasting prompts, no explaining APIs. Claude just knows what it can do."

---

## CLOSING (20 sec)

> "MCPConnect is open source and self-hosted - your credentials never leave your infrastructure. You can import an existing setup from a JSON file, export it for backup, and run it anywhere Docker runs."

> "The repo is on GitHub. If you find it useful, give it a star - and if you run into something broken or want a feature, open an issue."

---

## Recording Tips

- Have a live Jira (or mock API) ready so the Discover step actually returns endpoints
- Pre-create one composite tool so you can show the finished result without building it live
- Keep the Skills section brief - it is supporting material, not the headline feature
- The Monitoring section is a good trust moment - show a real call log if you have one
