# Docs

## Assistant Configuration

- System prompt: [SYSTEM_PROMPT.md](../SYSTEM_PROMPT.md)
- Mode policies: [src/config/assistant/policy.ts](../src/config/assistant/policy.ts)
- Heuristics: [src/config/assistant/heuristics.ts](../src/config/assistant/heuristics.ts)
- Prompt builders: [src/config/assistant/prompts.ts](../src/config/assistant/prompts.ts)

## Update Flow

1. Update high-level behavior in `SYSTEM_PROMPT.md`.
2. Update mode sections and routing rules in `src/config/assistant/policy.ts`.
3. Update fallback detection and memory heuristics in `src/config/assistant/heuristics.ts`.
4. Update AI prompt JSON contracts in `src/config/assistant/prompts.ts`.
5. Run `npm run build`, `npm run lint`, and `npm test`.
