import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Where archived audit logs are written.
 *
 * Vercel functions have no durable filesystem — only an ephemeral /tmp — so
 * production archives go to object storage. Local development and self-hosted
 * deployments fall back to a logs/ directory.
 */
export interface AuditSink {
  readonly name: string
  put(pathname: string, body: Buffer): Promise<void>
}

class BlobSink implements AuditSink {
  readonly name = 'vercel-blob'

  async put(pathname: string, body: Buffer): Promise<void> {
    // Imported lazily so local development does not require the SDK.
    const { put } = await import('@vercel/blob')

    await put(pathname, body, {
      access: 'private',
      contentType: 'application/gzip',
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })
  }
}

class FileSink implements AuditSink {
  readonly name = 'local-file'

  constructor(private readonly root = path.join(process.cwd(), 'logs')) {}

  async put(pathname: string, body: Buffer): Promise<void> {
    const target = path.resolve(this.root, pathname)

    if (!target.startsWith(path.resolve(this.root) + path.sep)) {
      throw new Error(`Refusing to write audit archive outside logs directory: ${pathname}`)
    }

    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, body)
  }
}

export function getAuditSink(): AuditSink {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return new BlobSink()
  }

  if (process.env.NODE_ENV !== 'production') {
    return new FileSink()
  }

  throw new Error(
    'No audit archive sink configured: set BLOB_READ_WRITE_TOKEN (production) or run outside production for local files.'
  )
}
