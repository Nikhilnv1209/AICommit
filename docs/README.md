# AICommit

AICommit is an AI-powered platform that helps developers manage GitHub repositories and projects through intelligent analysis, commit summaries, and meeting transcription.

## Overview

AICommit integrates with GitHub to provide AI-powered insights into your codebase, automatically summarizes commits using AI, and processes meeting recordings to extract actionable insights.

## Core Features

### 1. GitHub Repository Management
- Connect and manage multiple GitHub repositories
- Automatic commit tracking and analysis
- AI-powered commit summaries

### 2. AI-Powered Code Analysis
- Intelligent commit diff summarization using Google Gemini AI
- Source code embeddings for semantic search
- Question-answering system based on your codebase

### 3. Meeting Transcription & Analysis
- Upload meeting recordings via Cloudinary
- Audio transcription using AssemblyAI
- Automatic issue extraction from meetings

### 4. Project Collaboration
- Multi-user project access
- Credit-based usage system
- Stripe integration for credit purchases

## Technology Stack

- **Framework**: Next.js 15+ with App Router
- **Authentication**: Clerk
- **Database**: PostgreSQL with Prisma ORM
- **AI/ML**: Google Generative AI (Gemini), OpenAI
- **File Storage**: Cloudinary
- **Audio Processing**: AssemblyAI
- **Payments**: Stripe
- **Styling**: Tailwind CSS with shadcn/ui components

## Project Structure

```
├── app/                    # Next.js app router
│   ├── (auth)/            # Authentication routes
│   └── (protected)/       # Protected application routes
├── components/            # React components
│   └── ui/               # shadcn/ui components
├── lib/                   # Utility libraries
│   ├── github.ts         # GitHub API integration
│   ├── ai.ts             # AI summarization logic
│   ├── assemblyai.ts     # Audio transcription
│   └── stripe.ts         # Payment processing
├── prisma/               # Database schema and client
├── hooks/                # Custom React hooks
└── public/               # Static assets
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- GitHub Personal Access Token
- Google AI API Key
- Cloudinary account
- AssemblyAI API Key
- Stripe account (for payments)

### Environment Variables

Required environment variables (see `.env.example`):

- `DATABASE_URL` - PostgreSQL connection string
- `DIRECT_URL` - Direct database connection for Prisma
- `GITHUB_TOKEN` - GitHub personal access token
- `GOOGLE_GENERATIVE_AI_API_KEY` - Google AI API key
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key
- `CLERK_SECRET_KEY` - Clerk secret key
- `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- `CLOUDINARY_API_KEY` - Cloudinary API key
- `CLOUDINARY_API_SECRET` - Cloudinary API secret
- `ASSEMBLYAI_API_KEY` - AssemblyAI API key
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret

### Installation

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run postinstall

# Run development server
npm run dev
```

The development server runs on `http://localhost:3000`.

## Key Workflows

### 1. Project Creation & Setup
1. User authenticates via Clerk
2. Creates a new project with GitHub repository URL
3. System validates repository access
4. Initial commit history is fetched and summarized

### 2. Repository Indexing
1. User triggers indexing from the dashboard
2. System fetches source files from GitHub
3. Files are processed and embeddings are generated
4. Indexing progress is tracked in real-time
5. Upon completion, semantic search is available

### 3. Commit Polling
1. System periodically polls GitHub for new commits
2. New commits are fetched via GitHub API
3. Commit diffs are retrieved and summarized using AI
4. Summaries are stored in the database
5. Users see updated commit history with AI insights

### 4. Meeting Processing
1. User uploads meeting recording
2. File is stored on Cloudinary
3. AssemblyAI transcribes the audio
4. AI extracts key issues and action items
5. Issues are linked to the project

### 5. Credit System
1. Users start with 150 free credits
2. Actions consume credits (indexing, meeting analysis, etc.)
3. Users can purchase more credits via Stripe
4. Webhooks handle payment confirmations

## Architecture

### Database Schema

The application uses a PostgreSQL database with the following core entities:

- **User**: Application users with Clerk integration
- **Project**: GitHub repositories being analyzed
- **ProjectIndexing**: Tracks repository indexing status
- **Commit**: Git commits with AI-generated summaries
- **SourceCodeEmbedding**: Vector embeddings for code search
- **Question**: Q&A pairs generated from codebase
- **Meeting**: Uploaded meeting recordings
- **Issue**: Extracted issues from meetings
- **StripeTransaction**: Payment records

### AI Integration

AICommit uses multiple AI providers:

- **Google Gemini**: Primary model for commit summarization and code analysis
- **OpenAI**: Fallback and alternative processing
- **Vector Embeddings**: Cohere for generating code embeddings

### External APIs

- **GitHub API (Octokit)**: Repository access and commit retrieval
- **Cloudinary**: File storage for meeting recordings
- **AssemblyAI**: Audio transcription services
- **Stripe**: Payment processing and subscription management

## Development

### Scripts

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run postinstall` - Generate Prisma client

### Code Style

The project uses:
- TypeScript for type safety
- ESLint for code linting
- Tailwind CSS for styling
- shadcn/ui component library
- Winston for structured logging

## Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy with `git push`

### Self-Hosting

1. Build the application: `npm run build`
2. Set up PostgreSQL database
3. Configure environment variables
4. Run: `npm run start`

## Security Considerations

- All API keys and secrets are stored in environment variables
- Authentication handled by Clerk with secure session management
- Stripe webhooks validated for payment security
- Database connections use SSL in production
- GitHub tokens have minimal required permissions

## Support & Contributing

For issues and feature requests, please use the GitHub issue tracker.

## License

[Add your license information here]
