import { prisma } from '@/prisma/client'

/**
 * Store the embedding for one file of a project, replacing any previous row.
 *
 * A changed file must not leave its old row behind: the stale source would stay
 * searchable and the file would show up twice. Deleting first makes this
 * idempotent and also cleans up duplicates left by earlier runs.
 */
export async function saveSourceCodeEmbedding(params: {
  projectId: string
  fileName: string
  sourceCode: string
  summary: string
  contentHash: string
  embedding: number[]
}): Promise<string> {
  const { projectId, fileName, sourceCode, summary, contentHash, embedding } = params

  // pgvector wants a literal like '[0.1,0.2]'. A raw number[] would be encoded
  // as a Postgres array, which cannot be cast to vector.
  const vectorLiteral = `[${embedding.join(',')}]`

  return prisma.$transaction(async (tx) => {
    await tx.sourceCodeEmbedding.deleteMany({ where: { projectId, fileName } })

    const created = await tx.sourceCodeEmbedding.create({
      data: { sourceCode, fileName, summary, contentHash, projectId },
    })

    await tx.$executeRaw`
      UPDATE "SourceCodeEmbedding"
      SET "summeryEmbeddings" = ${vectorLiteral}::vector
      WHERE "id" = ${created.id}
    `

    return created.id
  })
}
