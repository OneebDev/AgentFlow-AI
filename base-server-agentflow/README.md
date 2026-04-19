# AgentFlow AI Backend

AgentFlow AI is a TypeScript/Express backend for a multi-mode AI assistant. It supports natural chat, learning, research, resource finding, lead generation, business strategy, scraping planning, and streaming research workflows backed by MongoDB, Redis, BullMQ, OpenAI, and Gemini.

## Assistant Architecture

- Central assistant behavior spec: [SYSTEM_PROMPT.md](./SYSTEM_PROMPT.md)
- Central mode and formatting policy: [src/config/assistant/policy.ts](./src/config/assistant/policy.ts)
- Heuristic intent, language, and memory helpers: [src/config/assistant/heuristics.ts](./src/config/assistant/heuristics.ts)
- Prompt builders used by planner and ranker: [src/config/assistant/prompts.ts](./src/config/assistant/prompts.ts)

## Core Capabilities

- ChatGPT-like natural conversation
- Same-language replies
- Automatic intent detection across 12 modes
- Exact-count resource and lead shaping
- Smart history-aware planning
- Crawl -> critic -> SSE result pipeline
- Lead/contact enrichment when website data exposes email or phone

## Runtime Requirements

- MongoDB
- Redis on `localhost:6379` unless configured otherwise
- OpenAI and/or Gemini API keys
- Search API keys for Tavily, Serper, Brave, SerpAPI, and YouTube as needed

## Scripts

- `npm run build` - compile TypeScript
- `npm run test` - run tests
- `npm run lint` - run ESLint
- `npm run start:dev` - dev runner via nodemon
- `npm run serve` - run compiled production server

## Notes

- Tests are configured so the MongoDB Winston transport does not create open handles.
- In the current local environment, `npm run serve` is still blocked until Redis is running on port `6379`.
