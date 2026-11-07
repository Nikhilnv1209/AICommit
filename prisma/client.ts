import { PrismaClient, type Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

type PrismaClientOptions = Prisma.PrismaClientOptions

/**
 * Optional driver adapters.
 *
 * By default Prisma talks to the database through its bundled query engine.
 * Setting `PRISMA_DRIVER` delegates the wire protocol to a Node.js driver
 * instead. This is useful when the engine cannot be used in the target
 * environment — e.g. serverless runtimes, or TLS certificate chains the
 * engine's own TLS stack does not understand.
 *
 * Each entry must stay provider-agnostic: the adapter owns the wire protocol,
 * so the same application code runs against any PostgreSQL host (Neon,
 * Supabase, RDS, self-hosted, ...). The engine remains the default so that
 * existing deployments are unaffected.
 */
const driverAdapters: Record<string, () => NonNullable<PrismaClientOptions['adapter']>> = {
  pg: () => {
    const connectionString = process.env.DATABASE_URL

    if (!connectionString) {
      throw new Error('PRISMA_DRIVER="pg" requires DATABASE_URL to be set')
    }

    return new PrismaPg({ connectionString })
  },
}

function resolveDriverAdapter(): PrismaClientOptions['adapter'] | undefined {
  const driver = process.env.PRISMA_DRIVER?.trim().toLowerCase()

  if (!driver) {
    return undefined
  }

  const createAdapter = driverAdapters[driver]

  if (!createAdapter) {
    throw new Error(
      `Unsupported PRISMA_DRIVER "${driver}". Supported drivers: ${Object.keys(driverAdapters).join(', ')}`
    )
  }

  return createAdapter()
}

export function createPrismaClient(): PrismaClient {
  const adapter = resolveDriverAdapter()

  return adapter ? new PrismaClient({ adapter }) : new PrismaClient()
}

export const prisma: PrismaClient = global.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') global.prisma = prisma
