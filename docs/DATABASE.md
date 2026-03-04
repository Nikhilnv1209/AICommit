# Database Schema Documentation

## Overview

AICommit uses PostgreSQL with Prisma ORM. The database supports vector embeddings for semantic search using the `pgvector` extension.

## Entity Relationship Diagram

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────┐
│     User     │◄─────►│  UserToProject   │◄─────►│    Project   │
└──────────────┘       └──────────────────┘       └──────┬───────┘
       │                                                  │
       │                   ┌────────────────────┐         │
       │                   │  ProjectIndexing   │         │
       │                   └────────────────────┘         │
       │                                                  │
       │         ┌─────────┐   ┌────────────────┐         │
       └────────►│Question │   │ SourceCodeEmb  │◄────────┘
                 └─────────┘   └────────────────┘
                                     │
       ┌─────────┐   ┌─────────┐     │
       │  Issue  │◄──┤ Meeting │◄────┘
       └─────────┘   └─────────┘
       
       ┌────────────────────┐
       │ StripeTransaction  │
       └────────────────────┘
```

## Models

### User

Stores application user information synced from Clerk.

```prisma
model User {
  id                  String              @id @default(cuid())
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt
  imageUrl            String?
  firstName           String
  lastName            String
  emailAddress        String              @unique
  credits             Int                 @default(150)
  userToProject       UserToProject[]
  questionsAsked      Question[]
  stripeTransactions  StripeTransaction[]
}
```

**Fields:**
- `id`: Unique identifier (CUID)
- `createdAt/updatedAt`: Timestamps
- `imageUrl`: Profile image URL from Clerk
- `firstName/lastName`: User's name
- `emailAddress`: Unique email address
- `credits`: Credit balance for AI operations (default: 150)

**Relations:**
- `userToProject`: Projects the user has access to
- `questionsAsked`: Questions asked by the user
- `stripeTransactions`: Purchase history

### Project

Represents a GitHub repository being analyzed.

```prisma
model Project {
  id                  String              @id @default(cuid())
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt
  name                String
  githubUrl           String
  deletedAt           DateTime?
  githubToken         String?
  userToProject       UserToProject[]
  commit              Commit[]
  sourceCodeEmbedding SourceCodeEmbedding[]
  savedQuestions      Question[]
  meetings            Meeting[]
  Issue               Issue[]
  indexing            ProjectIndexing?
}
```

**Fields:**
- `id`: Unique identifier (CUID)
- `name`: Project name
- `githubUrl`: Full GitHub repository URL
- `deletedAt`: Soft delete timestamp (null if active)
- `githubToken`: Optional custom GitHub token for private repos

**Relations:**
- `userToProject`: Users with access
- `commit`: Associated commits
- `sourceCodeEmbedding`: Vector embeddings
- `savedQuestions`: Questions about this project
- `meetings`: Uploaded meetings
- `Issue`: Extracted issues
- `indexing`: Indexing status (one-to-one)

### ProjectIndexing

Tracks the status of repository indexing jobs.

```prisma
model ProjectIndexing {
  id              String    @id @default(cuid())
  projectId       String    @unique
  project         Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  
  status          String    @default("IDLE")
  stage           String?   // FETCHING, PROCESSING, COMMIT_DIFFS
  error           String?
  errorSummary    String?   // "8 succeeded, 2 failed" or indexing summary
  processed       Int       @default(0)
  total           Int       @default(0)
  currentItem    String?   // Current file/commit being processed
  
  lastHeartbeat   DateTime?
  serverId        String?
  
  startedAt       DateTime?
  completedAt     DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}
```

**Fields:**
- `status`: Current state (IDLE, INDEXING, COMPLETED, ERROR, TIMEOUT)
- `stage`: Current processing stage (FETCHING, PROCESSING, COMMIT_DIFFS)
- `error`: Error message if failed
- `errorSummary`: Summary of partial failures or completion summary
- `processed/total`: Progress tracking (files or commits depending on stage)
- `currentItem`: Current file/commit being processed (displayed in UI)
- `lastHeartbeat`: Last progress update (for timeout detection)
- `serverId`: Server instance handling the job

### UserToProject

Junction table for many-to-many user-project relationship.

```prisma
model UserToProject {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  userId    String
  projectId String
  user      User     @relation(fields: [userId], references: [id])
  project   Project  @relation(fields: [projectId], references: [id])

  @@unique([userId, projectId])
}
```

### Commit

Stores Git commits with AI-generated summaries.

```prisma
model Commit {
  id                  String   @id @default(cuid())
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  projectId           String
  project             Project  @relation(fields: [projectId], references: [id])
  commitMessage       String
  commitHash          String   @unique
  commitAuthorName    String
  commitAuthorAvatar  String
  commitDate          DateTime
  summary             String
}
```

**Fields:**
- `commitHash`: Git commit SHA (unique)
- `commitMessage`: Original commit message
- `commitAuthorName/Avatar`: Author information
- `commitDate`: When commit was made
- `summary`: AI-generated summary of changes

### SourceCodeEmbedding

Vector embeddings of source code files for semantic search.

```prisma
model SourceCodeEmbedding {
  id                String   @id @default(cuid())
  summeryEmbeddings Unsupported("vector(1024)")?
  sourceCode        String
  fileName          String
  summary           String
  projectId         String
  project           Project  @relation(fields: [projectId], references: [id])
}
```

**Fields:**
- `summeryEmbeddings`: 1024-dimensional vector for similarity search
- `sourceCode`: Full source code content
- `fileName`: Path and filename
- `summary`: AI-generated file summary

### Question

Q&A pairs generated from codebase queries.

```prisma
model Question {
  id              String   @id @default(cuid())
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  question        String
  answer          String
  fileReferences  Json?
  projectId       String
  project         Project  @relation(fields: [projectId], references: [id])
  userId          String
  user            User     @relation(fields: [userId], references: [id])
}
```

**Fields:**
- `question`: User's question
- `answer`: AI-generated answer
- `fileReferences`: JSON array of relevant files

### Meeting

Uploaded meeting recordings.

```prisma
enum meetingStatus {
  PROCESSING
  COMPLETED
}

model Meeting {
  id          String        @id @default(cuid())
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  name        String
  meetingUrl  String
  projectId   String
  project     Project       @relation(fields: [projectId], references: [id])
  status      meetingStatus @default(PROCESSING)
  issues      Issue[]
}
```

**Fields:**
- `name`: Meeting title
- `meetingUrl`: Cloudinary URL
- `status`: Processing state

### Issue

Issues extracted from meeting transcriptions.

```prisma
model Issue {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  start       String   // Timestamp in video
  end         String   // Timestamp in video
  headline    String   // Issue title
  summary     String   // Detailed description
  gist        String   // Key points
  meetingId   String
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id])
  meeting     Meeting  @relation(fields: [meetingId], references: [id])
}
```

### StripeTransaction

Records of credit purchases.

```prisma
model StripeTransaction {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  credits     Int
}
```

## Indexes

### Performance Indexes

```sql
-- Commit lookups by project
CREATE INDEX "Commit_projectId_idx" ON "Commit"("projectId");

-- Question lookups
CREATE INDEX "Question_projectId_idx" ON "Question"("projectId");
CREATE INDEX "Question_userId_idx" ON "Question"("userId");

-- Meeting lookups
CREATE INDEX "Meeting_projectId_idx" ON "Meeting"("projectId");

-- Source code search
CREATE INDEX "SourceCodeEmbedding_projectId_idx" ON "SourceCodeEmbedding"("projectId");

-- Vector similarity search (auto-created by pgvector)
-- CREATE INDEX ON "SourceCodeEmbedding" USING ivfflat (summeryEmbeddings vector_cosine_ops);
```

## Vector Search Queries

### Find Similar Code

```sql
SELECT 
  "fileName",
  "summary",
  1 - (summeryEmbeddings <=> query_embedding) AS similarity
FROM "SourceCodeEmbedding"
WHERE "projectId" = 'project-id'
ORDER BY summeryEmbeddings <=> query_embedding
LIMIT 5;
```

### Prisma Query

```typescript
const similarFiles = await prisma.$queryRaw`
  SELECT "fileName", "summary",
    1 - (summeryEmbeddings <=> ${queryVector}::vector) as similarity
  FROM "SourceCodeEmbedding"
  WHERE "projectId" = ${projectId}
  ORDER BY summeryEmbeddings <=> ${queryVector}::vector
  LIMIT 5
`;
```

## Data Retention

- **Soft Deletes**: Projects use `deletedAt` for soft deletion
- **Commit History**: Limited to last 10 commits per poll
- **Meeting Recordings**: Stored on Cloudinary with retention policies
- **Embeddings**: Kept until project is hard deleted

## Backup Strategy

1. **Automated Backups**: Daily PostgreSQL backups
2. **Point-in-time Recovery**: Enabled for production
3. **Migration History**: All schema changes tracked in Prisma migrations
