# AgentFlow AI — System Architecture

## Text Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            FRONTEND (React)                             │
│  ┌──────────────┐   ┌─────────────────┐   ┌───────────────────────┐   │
│  │  SearchBar   │   │  AgentStatus    │   │   ResultsPanel        │   │
│  │  (input)     │   │  (pipeline viz) │   │   (ranked results)    │   │
│  └──────┬───────┘   └────────▲────────┘   └───────────▲───────────┘   │
│         │  POST /search      │ WS events              │ results        │
└─────────┼────────────────────┼────────────────────────┼───────────────┘
          │                    │                        │
          ▼                    │                        │
┌─────────────────────────────────────────────────────────────────────────┐
│                       API GATEWAY  :3000                                │
│  ┌──────────────────┐  ┌────────────────────┐  ┌────────────────────┐  │
│  │ POST /api/v1/    │  │  WebSocket Plugin  │  │ GET /api/v1/       │  │
│  │ search           │  │  /ws/:jobId        │  │ search/:jobId      │  │
│  └────────┬─────────┘  └────────┬───────────┘  └────────────────────┘  │
│           │ enqueue              │ subscribe to queue events            │
└───────────┼──────────────────────┼─────────────────────────────────────┘
            │                      │
            ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         REDIS  :6379                                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  research-queue  │  │  crawl-queue     │  │  critic-queue        │  │
│  │  (BullMQ)        │  │  (BullMQ)        │  │  (BullMQ)            │  │
│  └──────────┬───────┘  └──────────┬───────┘  └──────────┬───────────┘  │
│             │                     │                      │              │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                  results-queue  (BullMQ)                         │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                  Cache  (key/value TTL store)                      │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
            │                     │                      │
            ▼                     ▼                      ▼
┌───────────────┐      ┌─────────────────┐    ┌──────────────────────┐
│  RESEARCHER   │      │    CRAWLER      │    │       CRITIC         │
│  AGENT        │─────▶│    AGENT        │───▶│       AGENT          │
│               │      │                 │    │                      │
│ • Gemini API  │      │ • YouTube API   │    │ • Gemini API         │
│ • Intent      │      │ • SerpAPI       │    │ • Filter duplicates  │
│   analysis    │      │ • Cheerio       │    │ • Score & rank       │
│ • Query gen   │      │   scraper       │    │ • Summarise          │
└───────────────┘      └─────────────────┘    └──────────────────────┘
            │                     │                      │
            └─────────────────────┴──────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │     ORCHESTRATOR        │
                    │                         │
                    │ • Consumes results-queue│
                    │ • Persists to Postgres  │
                    │ • Caches results        │
                    │ • Updates job status    │
                    └──────────┬──────────────┘
                               │
                               ▼
                    ┌─────────────────────────┐
                    │    POSTGRESQL  :5432     │
                    │                         │
                    │ • search_jobs           │
                    │ • research_plans        │
                    │ • crawl_results         │
                    │ • final_results         │
                    └─────────────────────────┘
```

## Data Flow (Step by Step)

```
1. User types query in React frontend
2. Frontend POSTs to API Gateway → /api/v1/search
3. API Gateway:
   a. Validates input
   b. Creates search_jobs DB record (status=PENDING)
   c. Adds job to research-queue
   d. Returns { jobId, wsUrl }
4. Frontend opens WebSocket at /api/v1/search/:jobId/ws

5. RESEARCHER AGENT picks up job from research-queue:
   a. Calls Claude API for intent analysis & query generation
   b. Returns { intent, outputFormat, searchQueries, sources }
   c. Saves research_plan to DB
   d. Publishes to crawl-queue
   e. (WS): status → RESEARCHING

6. CRAWLER AGENT picks up job from crawl-queue:
   a. Dispatches YouTube, Google, Scraper fetchers in parallel
   b. Saves raw results to crawl_results DB
   c. Publishes to critic-queue
   d. (WS): status → CRAWLING

7. CRITIC AGENT picks up job from critic-queue:
   a. Deduplicates & filters results
   b. Calls Claude API to score + rank + summarise
   c. Publishes to results-queue
   d. (WS): status → CRITIQUING

8. ORCHESTRATOR picks up job from results-queue:
   a. Saves final_results to DB
   b. Updates search_jobs status → COMPLETED
   c. Caches results in Redis (1hr TTL)

9. API Gateway WS plugin receives results-queue completion event
10. Pushes final results to connected WebSocket clients
11. Frontend renders ResultsPanel with ranked results + AI summary
```

## Service Ports

| Service           | Port | Protocol    |
|-------------------|------|-------------|
| Frontend          | 5173 | HTTP / prod |
| API Gateway       | 3000 | HTTP + WS   |
| Redis             | 6379 | TCP         |
| PostgreSQL        | 5432 | TCP         |
| Orchestrator      | —    | Queue only  |
| Researcher Agent  | —    | Queue only  |
| Crawler Agent     | —    | Queue only  |
| Critic Agent      | —    | Queue only  |

## API Routes

### POST /api/v1/search
Submit a new search job.
```json
Request:  { "query": "string", "userId": "string" }
Response: { "jobId": "uuid", "status": "PENDING", "wsUrl": "/api/v1/search/{jobId}/ws" }
```

### GET /api/v1/search/:jobId
Poll job status.
```json
Response: {
  "jobId": "uuid",
  "status": "PENDING|RESEARCHING|CRAWLING|CRITIQUING|COMPLETED|FAILED",
  "results": {
    "bestResult": { ... },
    "rankedList": [ ... ],
    "summary": "string"
  }
}
```

### WS /api/v1/search/:jobId/ws
Real-time status frames:
```json
{ "type": "subscribed",  "jobId": "..." }
{ "type": "status",      "jobId": "...", "status": "CRAWLING" }
{ "type": "completed",   "jobId": "...", "results": { ... } }
{ "type": "failed",      "jobId": "...", "error": "..." }
```

### GET /health
Service health check (postgres + redis).
