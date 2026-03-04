# Architecture Overview

## System Architecture

AICommit follows a modern full-stack architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│                    Client Layer                         │
│         (Next.js 15 + React + TypeScript)               │
├─────────────────────────────────────────────────────────┤
│                  API Layer (Next.js)                    │
│         (Route Handlers + Server Actions)               │
├─────────────────────────────────────────────────────────┤
│                Business Logic Layer                     │
│    (GitHub Integration, AI Processing, Payments)        │
├─────────────────────────────────────────────────────────┤
│                  Data Access Layer                      │
│              (Prisma ORM + PostgreSQL)                  │
└─────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Authentication & Authorization

**Clerk Integration**
- Handles user authentication via OAuth (GitHub, Google, etc.)
- Manages sessions and JWT tokens
- Provides user management UI components
- Webhook support for user events

**Flow:**
1. User signs in via Clerk
2. Clerk creates/updates user in our database via webhooks
3. JWT token attached to requests
4. Middleware validates tokens on protected routes

### 2. GitHub Integration

**Octokit Client**
```typescript
// lib/github.ts
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
})
```

**Key Operations:**
- Fetch repository commits
- Get commit diffs
- Access repository metadata
- Handle rate limiting

### 3. Repository Indexing

The indexing system (`IndexingManager`) orchestrates the complete repository analysis workflow:

**Three-Stage Process:**
1. **FETCHING** (0-20%): Load source files from GitHub repository
2. **PROCESSING** (20-90%): Generate AI summaries and vector embeddings for each file
3. **COMMIT_DIFFS** (90-100%): Summarize commit diffs using AI

**Progress Tracking:**
- Real-time updates via Server-Sent Events (SSE)
- Current file/commit displayed during processing
- Completion feedback with summary statistics

**Components:**
- `IndexingManager`: Orchestrates the indexing workflow
- `GithubLoader`: Fetches and processes repository files
- `batchProcessDocuments`: Handles AI processing with progress callbacks
- `pollCommits`: Fetches and summarizes commits

**Key Files:**
- `lib/indexing-manager.ts`: Main indexing orchestration
- `lib/github-loader.ts`: Repository file loading and processing
- `lib/github.ts`: Commit polling and summarization
- `app/api/indexing-progress/route.ts`: SSE endpoint for progress updates

### 3. AI Processing Layer

**Primary AI Provider: Google Gemini**

**Commit Summarization:**
```typescript
// lib/ai.ts
export async function aiSummarizeCommit(diff: string): Promise<string> {
  // Uses Google Generative AI to summarize code changes
}
```

**Question Answering:**
- Vector search over source code embeddings
- Context-aware responses based on codebase

**Meeting Analysis:**
- Transcription via AssemblyAI
- Issue extraction using AI

### 4. Database Architecture

**PostgreSQL with Prisma**

**Key Tables:**

| Table | Purpose |
|-------|---------|
| User | Application users |
| Project | GitHub repositories |
| ProjectIndexing | Indexing job status |
| Commit | Git commits with AI summaries |
| SourceCodeEmbedding | Vector embeddings |
| Question | Q&A interactions |
| Meeting | Uploaded recordings |
| Issue | Extracted meeting issues |
| StripeTransaction | Payment records |

**Vector Extension:**
PostgreSQL vector extension enables semantic search:
```prisma
summeryEmbeddings Unsupported("vector(1024)")?
```

### 5. File Storage

**Cloudinary Integration**
- Stores meeting recordings
- Provides CDN URLs for playback
- Handles video/audio processing

### 6. Payment System

**Stripe Integration**
- Credit-based usage model
- Checkout sessions for purchases
- Webhook handling for events
- Transaction logging

## Data Flow

### Repository Indexing Flow

```
User Request
    │
    ▼
┌─────────────┐
│  Start      │
│  Indexing   │
└─────────────┘
    │
    ▼
┌─────────────┐     ┌─────────────┐
│  Fetch Git  │────▶│  GitHub API │
│  Repository │     └─────────────┘
└─────────────┘
    │
    ▼
┌─────────────┐     ┌─────────────┐
│  Process    │────▶│  AI Service │
│  Files      │     │  (Gemini)   │
└─────────────┘     └─────────────┘
    │
    ▼
┌─────────────┐     ┌─────────────┐
│  Generate   │────▶│  PostgreSQL │
│  Embeddings │     │  (Vector)   │
└─────────────┘     └─────────────┘
```

### Commit Polling Flow

```
Scheduled/Triggered
       │
       ▼
┌─────────────┐
│  Get Latest │
│  Commits    │
└─────────────┘
       │
       ▼
┌─────────────┐
│  Filter New │
│  Commits    │
└─────────────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│  Fetch      │────▶│  GitHub API │
│  Diffs      │     └─────────────┘
└─────────────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│  Summarize  │────▶│  Google AI  │
│  w/ AI      │     └─────────────┘
└─────────────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│  Store in   │────▶│  PostgreSQL │
│  Database   │     └─────────────┘
└─────────────┘
```

## External Services

| Service | Purpose | Rate Limits |
|---------|---------|-------------|
| GitHub API | Repository access | 5000/hour (authenticated) |
| Google AI | Text generation | Varies by tier |
| AssemblyAI | Audio transcription | Per subscription |
| Cloudinary | File storage | Per plan |
| Stripe | Payments | N/A |

## Caching Strategy

### Client-Side Caching
- React Query for API response caching
- Local storage for user preferences
- Session storage for temporary data

### Server-Side Caching
- Prisma query caching (implicit)
- Static page generation where applicable
- ISR for dynamic content

## Security Architecture

### Authentication
- JWT tokens via Clerk
- Secure cookie handling
- CSRF protection

### Authorization
- Row-level security in database
- User-project relationship validation
- Credit balance checks

### Data Protection
- Environment variables for secrets
- API key rotation support
- Encrypted database connections
- Input sanitization

## Scalability Considerations

### Horizontal Scaling
- Stateless API design
- Database connection pooling
- External service load balancing

### Performance Optimizations
- Vector indexing for semantic search
- Batch processing for commits
- Lazy loading of embeddings
- Optimized Prisma queries

## Monitoring & Logging

**Winston Logger**
Structured logging across the application:

```typescript
logInfo('Component', 'Message', important)
logError('Component', 'Message', error)
logDebug('Component', 'Message')
```

**Key Metrics:**
- Indexing success/failure rates
- AI API response times
- GitHub API usage
- User activity
- Credit consumption

## Deployment Architecture

### Production Setup

```
┌─────────────────┐
│   Vercel Edge   │
│   (Next.js)     │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐  ┌──▼────┐
│Postgre│  │Redis  │
│SQL    │  │(Opt)  │
└───────┘  └───────┘
```

### Environment Separation
- Development: Local PostgreSQL, test APIs
- Staging: Production-like environment
- Production: Managed PostgreSQL, production APIs
