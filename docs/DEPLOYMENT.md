# Deployment Guide

## Overview

This guide covers deploying AICommit to production environments.

## Prerequisites

### Required Accounts

1. **Vercel**: For hosting the Next.js application
2. **PostgreSQL Database**: Options include:
   - Vercel Postgres
   - Supabase
   - Railway
   - AWS RDS
   - Self-hosted PostgreSQL with pgvector
3. **GitHub**: Personal access token with repo access
4. **Clerk**: Authentication service
5. **Cloudinary**: File storage for meetings
6. **AssemblyAI**: Audio transcription service
7. **Stripe**: Payment processing
8. **Google AI**: For Gemini API access

## Environment Setup

### 1. Database Setup

#### Option A: Vercel Postgres
```bash
# Install Vercel Postgres
npm install @vercel/postgres

# Set up in Vercel dashboard
# Connection strings provided automatically
```

#### Option B: Supabase
1. Create new project in Supabase
2. Enable Vector extension:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. Copy connection strings from Settings > Database

#### Option C: Self-hosted
```bash
# Install PostgreSQL with pgvector
docker run -d \
  --name aicommit-db \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_DB=aicommit \
  -p 5432:5432 \
  ankane/pgvector:latest

# Run migrations
npx prisma migrate deploy
```

### 2. Required Environment Variables

Create a `.env.production` file:

```bash
# Database
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."  # Direct connection for migrations

# Authentication (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_..."
CLERK_SECRET_KEY="sk_..."
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL="/dashboard"
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL="/dashboard"

# GitHub
GITHUB_TOKEN="ghp_..."

# AI Services
GOOGLE_GENERATIVE_AI_API_KEY="..."
OPENAI_API_KEY="sk-..."  # Optional fallback

# File Storage (Cloudinary)
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."

# Audio Transcription (AssemblyAI)
ASSEMBLYAI_API_KEY="..."

# Payments (Stripe)
STRIPE_SECRET_KEY="sk_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_..."

# App URL
NEXT_PUBLIC_APP_URL="https://your-domain.com"
```

## Deployment Steps

### 1. Vercel Deployment

#### Connect Repository
1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Select the project

#### Configure Build Settings
```json
{
  "framework": "nextjs",
  "buildCommand": "prisma generate && next build",
  "installCommand": "npm install",
  "outputDirectory": ".next"
}
```

#### Set Environment Variables
In Vercel dashboard:
1. Go to Project Settings > Environment Variables
2. Add all variables from `.env.production`
3. Mark sensitive variables as "Secret"

### 2. Database Migration

```bash
# Deploy migrations
npx prisma migrate deploy

# Or use Vercel CLI
vercel --prod
```

### 3. Configure Webhooks

#### Clerk Webhooks
1. In Clerk Dashboard: Configure > Webhooks
2. Add endpoint: `https://your-domain.com/api/webhooks/clerk`
3. Select events:
   - `user.created`
   - `user.updated`
   - `user.deleted`

#### Stripe Webhooks
1. In Stripe Dashboard: Developers > Webhooks
2. Add endpoint: `https://your-domain.com/api/stripe/webhook`
3. Select events:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

### 4. Domain Configuration

#### Custom Domain (Optional)
1. In Vercel: Project Settings > Domains
2. Add your domain
3. Configure DNS records as instructed

#### SSL/TLS
- Automatically handled by Vercel
- Custom certificates available in Pro plan

## Post-Deployment Verification

### 1. Health Checks

```bash
# Test API endpoints
curl https://your-domain.com/api/health

# Verify database connection
curl https://your-domain.com/api/projects
```

### 2. Feature Testing

- [ ] User registration/login via Clerk
- [ ] Create a new project with GitHub URL
- [ ] Trigger repository indexing
- [ ] Verify commit polling works
- [ ] Test question-answering feature
- [ ] Upload a meeting recording
- [ ] Purchase credits via Stripe

### 3. Monitoring Setup

#### Vercel Analytics
1. Enable in Vercel Dashboard > Analytics
2. Track Web Vitals and traffic

#### Error Tracking (Optional)
```bash
# Install Sentry
npm install @sentry/nextjs

# Initialize in your app
```

## Production Optimizations

### 1. Performance

#### Enable Vercel Edge Network
- Automatic for all deployments
- Configure cache headers for static assets

#### Database Connection Pooling
```typescript
// prisma/client.ts
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

### 2. Security

#### Security Headers
```typescript
// next.config.ts
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
]
```

#### Rate Limiting
Consider implementing rate limiting middleware for API routes.

### 3. Backup Strategy

#### Database Backups
- Enable automated backups in your database provider
- Schedule: Daily
- Retention: 30 days

#### Disaster Recovery
1. Document restore procedures
2. Test restore process quarterly
3. Keep environment variables backed up securely

## Scaling Considerations

### Horizontal Scaling
- Vercel automatically scales serverless functions
- Database: Consider read replicas for heavy workloads
- Use Redis for caching (optional)

### Cost Optimization
- Monitor AI API usage
- Implement credit limits per user
- Use GitHub API efficiently to avoid rate limits

## Troubleshooting

### Common Issues

#### Database Connection Errors
```
Solution: Check DATABASE_URL format and network access
```

#### Build Failures
```
Solution: Ensure all environment variables are set in Vercel
```

#### Webhook Failures
```
Solution: Verify webhook secrets match and endpoints are correct
```

### Logs and Debugging

Access logs in Vercel Dashboard:
1. Go to Project > Deployments
2. Select deployment
3. Click "View Function Logs"

## Maintenance

### Regular Tasks

- [ ] Update dependencies monthly
- [ ] Review and rotate API keys quarterly
- [ ] Monitor error rates and performance
- [ ] Check database storage usage
- [ ] Review Stripe webhook logs

### Updates

```bash
# Update dependencies
npm update

# Deploy updates
vercel --prod

# Run migrations if needed
npx prisma migrate deploy
```

## Support

For deployment issues:
- Vercel Support: [vercel.com/support](https://vercel.com/support)
- Prisma Documentation: [prisma.io/docs](https://www.prisma.io/docs)
- Next.js Documentation: [nextjs.org/docs](https://nextjs.org/docs)
