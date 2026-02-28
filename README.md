# AICommit

AICommit is an AI-powered platform that helps developers manage GitHub repositories and projects through intelligent analysis, commit summaries, and meeting transcription.

## Overview

AICommit integrates with GitHub to provide AI-powered insights into your codebase, automatically summarizes commits using AI, and processes meeting recordings to extract actionable insights.

## Features

### GitHub Repository Management
- Connect and manage multiple GitHub repositories
- Automatic commit tracking and analysis
- AI-powered commit summaries

### AI-Powered Code Analysis
- Intelligent commit diff summarization using Google Gemini AI
- Source code embeddings for semantic search
- Question-answering system based on your codebase

### Meeting Transcription & Analysis
- Upload meeting recordings via Cloudinary
- Audio transcription using AssemblyAI
- Automatic issue extraction from meetings

### Project Collaboration
- Multi-user project access
- Credit-based usage system
- Stripe integration for credit purchases

## Tech Stack

- **Framework**: Next.js 15+ with App Router
- **Authentication**: Clerk
- **Database**: PostgreSQL with Prisma ORM & pgvector
- **AI/ML**: Google Gemini, Sarvam, Cohere
- **File Storage**: Cloudinary
- **Audio Processing**: AssemblyAI
- **Payments**: Stripe

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database with pgvector extension
- GitHub Personal Access Token
- Google AI API Key
- Cloudinary account
- AssemblyAI API Key (for transcription)
- Stripe account (for payments)

### Installation

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run postinstall

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Project Structure

```
├── app/                    # Next.js App Router
│   ├── (auth)/            # Authentication routes
│   ├── (protected)/       # Protected application routes
│   └── api/               # API routes
├── components/            # React components
├── lib/                   # Core libraries
│   ├── github.ts          # GitHub API integration
│   ├── github-loader.ts   # Repository indexing
│   ├── indexing-manager.ts # Indexing orchestration
│   ├── ai.ts              # AI services
│   └── ...
├── prisma/                # Database schema
├── hooks/                 # Custom React hooks
├── docs/                  # Documentation
└── public/                # Static assets
```

## Environment Variables

See `.env.example` for required environment variables:

```bash
DATABASE_URL           # PostgreSQL connection string
GITHUB_TOKEN           # GitHub personal access token
GOOGLE_GENERATIVE_AI_API_KEY  # Google AI API key
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY  # Clerk public key
CLERK_SECRET_KEY       # Clerk secret key
CLOUDINARY_*            # Cloudinary configuration
ASSEMBLYAI_API_KEY     # AssemblyAI API key
STRIPE_SECRET_KEY      # Stripe secret key
```

## Documentation

Detailed documentation available in the `docs/` folder:

- [Getting Started](docs/README.md)
- [API Reference](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database Schema](docs/DATABASE.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Development Guide](docs/DEVELOPMENT.md)

## Indexing Workflow

The repository indexing process consists of three stages:

1. **FETCHING** (0-20%): Loading files from GitHub repository
2. **PROCESSING** (20-90%): Analyzing files with AI and generating embeddings
3. **COMMIT_DIFFS** (90-100%): Summarizing commit diffs using AI

Progress is displayed in real-time via Server-Sent Events (SSE).

## Scripts

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## License

[Add your license information here]
