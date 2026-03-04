# Development Guide

## Getting Started

### Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher
- Git
- PostgreSQL 14+ with pgvector extension

### Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd aicommit

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your values

# Generate Prisma client
npm run postinstall

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

The application will be available at `http://localhost:3000`.

## Development Environment

### IDE Setup

**VS Code Extensions (Recommended):**
- ESLint
- Prettier
- Prisma
- Tailwind CSS IntelliSense
- TypeScript Hero

**Settings:**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  }
}
```

### Environment Variables

Create `.env.local`:

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/aicommit"
DIRECT_URL="postgresql://user:password@localhost:5432/aicommit"

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="your_clerk_publishable_key"
CLERK_SECRET_KEY="your_clerk_secret_key"
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"

# GitHub
GITHUB_TOKEN="your_github_token"

# AI Services
GOOGLE_GENERATIVE_AI_API_KEY="your_google_ai_key"
OPENAI_API_KEY="your_openai_key"  # Optional

# Cloudinary
CLOUDINARY_CLOUD_NAME="your_cloud_name"
CLOUDINARY_API_KEY="your_api_key"
CLOUDINARY_API_SECRET="your_api_secret"

# AssemblyAI
ASSEMBLYAI_API_KEY="your_assemblyai_key"

# Stripe
STRIPE_SECRET_KEY="your_stripe_secret"
STRIPE_WEBHOOK_SECRET="your_webhook_secret"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="your_stripe_publishable"
```

## Project Structure

```
aicommit/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Auth routes (sign-in, sign-up)
│   ├── (protected)/       # Protected app routes
│   │   ├── dashboard/
│   │   ├── project/
│   │   └── settings/
│   ├── api/               # API routes
│   ├── layout.tsx         # Root layout
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   └── [feature]/        # Feature-specific components
├── lib/                   # Utility libraries
│   ├── github.ts         # GitHub API integration
│   ├── ai.ts             # AI services
│   ├── stripe.ts         # Payment processing
│   └── utils.ts          # Helper functions
├── hooks/                 # Custom React hooks
├── prisma/               # Database
│   ├── schema.prisma     # Schema definition
│   └── client.ts         # Prisma client
├── public/               # Static assets
├── types/                # TypeScript types
└── docs/                 # Documentation
```

## Development Workflow

### Branch Strategy

```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "feat: add new feature"

# Push to remote
git push origin feature/your-feature-name

# Create pull request
```

### Commit Convention

We follow conventional commits:

```
feat: add new feature
fix: bug fix
docs: documentation changes
style: formatting, missing semi colons, etc.
refactor: code refactoring
test: adding tests
chore: maintenance tasks
```

### Code Style

**TypeScript:**
- Use strict mode
- Explicit return types on functions
- Interface over type for object shapes

**React:**
- Functional components with hooks
- Props interface defined
- use client/use server appropriately

**CSS/Tailwind:**
- Use Tailwind classes primarily
- Custom CSS in globals.css for complex cases
- CSS variables for theming

## Database Development

### Schema Changes

```bash
# Modify prisma/schema.prisma

# Create migration
npx prisma migrate dev --name descriptive_name

# Generate client
npx prisma generate

# Open Prisma Studio
npx prisma studio
```

### Seeding Data

Create `prisma/seed.ts`:

```typescript
import { prisma } from './client'

async function main() {
  // Seed data here
}

main()
```

Run: `npx prisma db seed`

## Testing

### Manual Testing

Test these flows regularly:
1. User registration/login
2. Project creation
3. Repository indexing
4. Commit polling
5. Question answering
6. Meeting upload
7. Credit purchase

### API Testing

Use tools like Postman or curl:

```bash
# Example: Create project
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "Test", "githubUrl": "https://github.com/user/repo"}'
```

## Debugging

### Server-Side Debugging

Add to your code:
```typescript
import { logDebug, logError } from '@/lib/logger'

logDebug('ComponentName', 'Debug message', data)
logError('ComponentName', 'Error message', error)
```

View logs in terminal or Vercel dashboard.

### Client-Side Debugging

Use React Developer Tools:
- Inspect component hierarchy
- View props and state
- Profile performance

### Database Debugging

```bash
# View queries
DEBUG="prisma:*" npm run dev

# Or use Prisma Studio
npx prisma studio
```

## Common Tasks

### Adding a New API Route

1. Create file: `app/api/your-route/route.ts`
2. Implement handlers:

```typescript
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // Handle GET
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  // Handle POST
}
```

### Adding a New Component

1. Create file: `components/ui/component.tsx`
2. Follow shadcn/ui patterns
3. Export from `components/ui/index.ts`

### Adding an Environment Variable

1. Add to `.env.local`
2. Add to `.env.example`
3. Update type definitions if needed
4. Document in relevant docs

## Troubleshooting

### Common Issues

**Build Errors:**
```bash
# Clear cache
rm -rf .next node_modules
npm install
npm run build
```

**Database Connection:**
- Verify PostgreSQL is running
- Check connection string format
- Ensure pgvector extension is enabled

**Clerk Auth Issues:**
- Verify keys are correct
- Check Clerk dashboard for domain settings
- Ensure middleware is configured

**AI API Errors:**
- Check API key validity
- Monitor rate limits
- Review API documentation

## Performance Tips

### Development
- Use `npm run dev --turbo` for faster builds
- Enable React Strict Mode
- Use React DevTools Profiler

### Database
- Add indexes for frequently queried fields
- Use connection pooling in production
- Monitor slow queries

### API
- Implement caching for expensive operations
- Use pagination for large datasets
- Batch operations where possible

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Clerk Documentation](https://clerk.com/docs)
- [shadcn/ui Components](https://ui.shadcn.com)

## Contributing

1. Fork the repository
2. Create your feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

Please ensure:
- Code follows project style
- All tests pass
- Documentation is updated
- Commit messages are clear
