# API Documentation

## Authentication

All API routes are protected and require authentication via Clerk. The authentication middleware is automatically applied to all routes under `(protected)`.

## API Routes

### GitHub Routes

#### GET `/api/github/commits`
Fetch commits for a specific project.

**Query Parameters:**
- `projectId` (string, required): The project ID

**Response:**
```json
{
  "commits": [
    {
      "commitHash": "string",
      "commitAuthorName": "string",
      "commitAuthorAvatar": "string",
      "commitMessage": "string",
      "commitDate": "ISO date string",
      "summary": "AI-generated summary"
    }
  ]
}
```

#### POST `/api/github/poll-commits`
Trigger manual commit polling for a project.

**Body:**
```json
{
  "projectId": "string"
}
```

### Project Routes

#### GET `/api/projects`
List all projects for the authenticated user.

**Response:**
```json
{
  "projects": [
    {
      "id": "string",
      "name": "string",
      "githubUrl": "string",
      "createdAt": "ISO date string",
      "updatedAt": "ISO date string"
    }
  ]
}
```

#### POST `/api/projects`
Create a new project.

**Body:**
```json
{
  "name": "string",
  "githubUrl": "string"
}
```

#### DELETE `/api/projects/:id`
Delete a project (soft delete).

### Indexing Routes

#### POST `/api/indexing/start`
Start indexing a repository.

**Body:**
```json
{
  "projectId": "string"
}
```

**Response:**
```json
{
  "indexingId": "string",
  "status": "INDEXING"
}
```

#### GET `/api/indexing-progress`
Get indexing status for a project via Server-Sent Events (SSE).

**Query Parameters:**
- `projectId` (string, required)

**Response (SSE stream):**
```json
{
  "status": "IDLE | INDEXING | COMPLETED | ERROR | TIMEOUT",
  "stage": "FETCHING | PROCESSING | COMMIT_DIFFS | null",
  "processed": 0,
  "total": 0,
  "currentItem": "filename.go or commit message",
  "error": "string | null",
  "errorSummary": "string | null"
}
```

**Progress Stages:**
- `FETCHING` (0-20%): Loading files from GitHub
- `PROCESSING` (20-90%): AI analysis and embedding generation
- `COMMIT_DIFFS` (90-100%): Commit summarization

**Note:** The `currentItem` field shows the file being processed during FETCHING/PROCESSING stages, and the commit message during COMMIT_DIFFS stage.

### Meeting Routes

#### POST `/api/meetings`
Upload and process a meeting recording.

**Body (multipart/form-data):**
- `file`: Audio/video file
- `projectId`: Project ID
- `name`: Meeting name

**Response:**
```json
{
  "meetingId": "string",
  "status": "PROCESSING",
  "url": "Cloudinary URL"
}
```

#### GET `/api/meetings/:id`
Get meeting details including transcription and issues.

### Question Routes

#### POST `/api/questions`
Ask a question about the codebase.

**Body:**
```json
{
  "projectId": "string",
  "question": "string"
}
```

**Response:**
```json
{
  "answer": "string",
  "fileReferences": [
    {
      "fileName": "string",
      "summary": "string"
    }
  ]
}
```

### Stripe Routes

#### POST `/api/stripe/checkout`
Create a Stripe checkout session for credit purchase.

**Body:**
```json
{
  "credits": 100,
  "price": 1000
}
```

**Response:**
```json
{
  "sessionId": "string",
  "url": "string"
}
```

#### POST `/api/stripe/webhook`
Stripe webhook endpoint for payment events.

## Error Handling

All API endpoints return consistent error responses:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  }
}
```

### Common Error Codes

- `UNAUTHORIZED`: Authentication required
- `FORBIDDEN`: Insufficient permissions
- `NOT_FOUND`: Resource not found
- `VALIDATION_ERROR`: Invalid request data
- `RATE_LIMITED`: Too many requests
- `INTERNAL_ERROR`: Server error

## Rate Limiting

API endpoints are rate-limited per user:

- Standard endpoints: 100 requests per minute
- AI-powered endpoints: 20 requests per minute
- GitHub API calls: Subject to GitHub's rate limits

## Webhooks

### Stripe Webhooks

Configure Stripe webhook endpoint to: `https://your-domain.com/api/stripe/webhook`

Required events:
- `checkout.session.completed`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

## SDK / Client Usage

### React Query Hooks

The application uses React Query for data fetching. Key hooks:

```typescript
// Fetch projects
const { data: projects } = useProjects()

// Fetch commits
const { data: commits } = useCommits(projectId)

// Fetch indexing status
const { data: status } = useIndexingStatus(projectId)

// Create project
const mutation = useCreateProject()
```

### Authentication

Use Clerk's hooks for authentication:

```typescript
import { useUser, useAuth } from '@clerk/nextjs'

const { user } = useUser()
const { getToken } = useAuth()
```
