# AI Agents & Team Collaboration Guide

## Purpose

This document provides guidance for AI agents and development teams working on the AICommit codebase. It focuses on collaboration patterns, problem-solving approaches, and coding conventions rather than technical implementation details.

## Before You Start

### Understanding the Problem

Always understand the problem thoroughly before proposing solutions:

1. **Read the context**: Check existing documentation in `docs/` folder
2. **Explore the codebase**: Understand the current implementation and patterns
3. **Identify constraints**: Consider rate limits, credit systems, and external API dependencies
4. **Ask clarifying questions**: If requirements are ambiguous, seek clarification

### Key Domain Concepts

- **Project**: A GitHub repository being analyzed
- **Indexing**: The three-stage process of analyzing a repository (FETCHING → PROCESSING → COMMIT_DIFFS)
- **Credits**: Resource usage system limiting AI operations
- **Embeddings**: Vector representations of source code for semantic search
- **Polling**: Periodic fetching of new commits from GitHub

## Collaboration Patterns

### Communication Guidelines

1. **Be concise**: Avoid unnecessary explanations unless asked
2. **Reference existing code**: Point to specific files and line numbers when discussing implementations
3. **Suggest, don't assume**: Propose changes rather than making assumptions about requirements
4. **Document decisions**: If you make architectural decisions, document the reasoning

### Code Review Principles

When reviewing or suggesting code changes:

1. **Follow existing patterns**: Match the style and conventions already in the codebase
2. **Maintain type safety**: All new code should be TypeScript with proper types
3. **Consider error handling**: How will failures be handled and logged?
4. **Check credit consumption**: Does the feature respect the credit system?
5. **Verify external API usage**: Are rate limits and quotas respected?

## Problem-Solving Approach

### Investigation Steps

Before implementing a feature or fix:

1. **Search the codebase**: Find related functionality using grep or file search
2. **Check similar features**: Look at how similar features are implemented
3. **Understand data flow**: Trace how data moves through the system
4. **Review error patterns**: Check how errors are handled in similar contexts

### Decision Framework

When choosing between implementation options:

1. **Simplicity first**: Prefer simpler solutions unless performance is critical
2. **Consistency**: Match existing patterns in the codebase
3. **Testability**: Consider how the code can be tested
4. **Maintainability**: Will future developers understand this code?

## Coding Patterns

### File Organization

- Place utilities in `lib/` with descriptive names
- Keep components in `components/` organized by feature
- Use `(auth)` and `(protected)` route groups appropriately
- Co-locate related server actions with their routes

### Naming Conventions

- Use descriptive variable names that explain intent
- Prefix boolean variables with `is`, `has`, or `should`
- Use PascalCase for components and types
- Use camelCase for functions and variables
- Use UPPER_SNAKE_CASE for constants

### Error Handling

Always handle errors gracefully:

```typescript
// Good: Specific error handling with logging
try {
  const result = await riskyOperation()
  return result
} catch (error) {
  logError('ComponentName', 'Operation failed', error)
  throw new Error('User-friendly error message')
}
```

### Async Patterns

- Use async/await over raw promises
- Handle promise rejections explicitly
- Consider using React Query for client-side data fetching
- Use Server Actions for form submissions and mutations

### Database Operations

- Use Prisma's type-safe queries
- Consider transaction boundaries for multi-step operations
- Check credit balance before expensive operations
- Handle database connection errors gracefully

## AI Integration Guidelines

### Working with External AI Services

When integrating with Google Gemini, OpenAI, or other AI services:

1. **Wrap in try-catch**: AI services can fail or rate-limit
2. **Validate inputs**: Ensure prompts are well-formed
3. **Parse outputs defensively**: AI responses may vary
4. **Log usage**: Track token consumption for cost monitoring
5. **Respect rate limits**: Implement backoff strategies

### Prompt Engineering

When creating AI prompts:

1. **Be specific**: Clear instructions yield better results
2. **Provide examples**: Few-shot prompting improves accuracy
3. **Set constraints**: Define output format and length limits
4. **Test thoroughly**: AI behavior can be non-deterministic

## Testing Considerations

### Manual Testing Checklist

Before marking a feature complete:

- [ ] Test with valid inputs
- [ ] Test with invalid/malformed inputs
- [ ] Test error scenarios
- [ ] Test with insufficient credits
- [ ] Verify UI updates correctly
- [ ] Check console for errors

### Integration Testing

Key flows to verify:

1. **Authentication flow**: Sign-up, sign-in, sign-out
2. **Project creation**: Linking a GitHub repository
3. **Indexing workflow**: Complete three-stage indexing process
4. **Commit polling**: Fetching and summarizing new commits
5. **Question answering**: Semantic search and response generation
6. **Meeting upload**: File upload, transcription, and issue extraction
7. **Credit purchase**: Stripe checkout and webhook handling

## Performance Guidelines

### Optimization Priorities

1. **Database queries**: Use indexes, avoid N+1 queries
2. **AI API calls**: Batch operations, cache results when possible
3. **GitHub API**: Respect rate limits, use conditional requests
4. **Client-side**: Lazy load components, optimize images

### Resource Management

- Monitor credit consumption per operation
- Implement timeouts for long-running operations
- Use connection pooling for database
- Clean up resources in finally blocks

## Security Awareness

### Data Handling

- Never log sensitive data (API keys, tokens, personal info)
- Validate all user inputs
- Use parameterized queries (Prisma handles this)
- Sanitize data before displaying in UI

### Authentication & Authorization

- Always verify user authentication on protected routes
- Check project ownership before operations
- Validate credit balance before expensive operations
- Use Clerk's built-in security features

## Documentation

### When to Document

Document when:

- Introducing new architectural patterns
- Creating complex business logic
- Adding new external integrations
- Changing deployment procedures

### Documentation Style

- Be concise and factual
- Include code examples for complex patterns
- Reference related documentation
- Keep technical details in appropriate docs (API.md, ARCHITECTURE.md, etc.)

## Common Pitfalls

### Avoid These Patterns

1. **Hardcoding values**: Use environment variables for configuration
2. **Ignoring errors**: Always handle promise rejections
3. **Blocking the main thread**: Use async operations for I/O
4. **Memory leaks**: Clean up event listeners and subscriptions
5. **Race conditions**: Be careful with shared state

### GitHub API Considerations

- Respect the 5000 requests/hour rate limit
- Handle 404s gracefully (repository not found, etc.)
- Consider pagination for large repositories
- Cache responses when appropriate

### Credit System Awareness

- Check credit balance before operations
- Deduct credits atomically
- Handle insufficient credit scenarios gracefully
- Log credit consumption for auditing

## Getting Help

### Resources

- Check `docs/` folder for technical details
- Review similar implementations in the codebase
- Look at test files for usage examples
- Check recent commits for context on changes

### Questions to Ask

When stuck, ask:

1. What is the user trying to accomplish?
2. What is the current behavior?
3. What is the expected behavior?
4. Are there similar features I can reference?
5. What are the constraints (credits, rate limits, etc.)?

## Summary

Effective collaboration on AICommit requires:

1. **Understanding first**: Read docs and explore code before coding
2. **Consistency**: Follow existing patterns and conventions
3. **Defensive coding**: Handle errors and edge cases
4. **Resource awareness**: Respect credits and rate limits
5. **Clear communication**: Be concise and reference specifics

Remember: The goal is to maintain a high-quality, maintainable codebase that serves users effectively while managing resources responsibly.
