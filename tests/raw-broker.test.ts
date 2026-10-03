import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { RequestBroker } from '../src/main/request-broker'
import { RAW_LIMITS, byteSize } from '../src/shared/raw'
import type {
  JsonPointer,
  NodeResult,
  RelativePath,
  SourceRevision,
  WorkspaceId,
  DirectoryPath,
  DirectoryResult,
} from '../src/shared/raw'
import type { Request } from '../src/shared/protocol'
const command = () => ({
  kind: 'read' as const,
  address: {
    source: { workspaceId: randomUUID() as WorkspaceId, relativePath: 'a.json' as RelativePath },
    pointer: '' as JsonPointer,
  },
  expectedRevision: randomUUID() as SourceRevision,
})
describe('raw query broker boundary', () => {
  it('accepts bounded directory/release outputs and rejects inconsistent discovered addresses', async () => {
    const sent: Request[] = [],
      broker = new RequestBroker((request) => sent.push(request))
    const workspaceId = randomUUID() as WorkspaceId
    const input = {
      kind: 'directory' as const,
      workspaceId,
      directory: '' as DirectoryPath,
      limit: 200,
      cursor: null,
    }
    const first = broker.request<DirectoryResult>({
      type: 'request',
      id: randomUUID(),
      operation: 'raw',
      input,
    })
    const value: DirectoryResult = {
      workspaceId,
      directory: '' as DirectoryPath,
      items: [
        {
          kind: 'source',
          name: 'a.json',
          source: { workspaceId, relativePath: 'a.json' as RelativePath },
        },
      ],
      nextCursor: null,
      truncated: false,
    }
    broker.accept({ type: 'response', id: sent[0].id, result: { ok: true, value } })
    expect(await first).toEqual(value)
    const released = broker.request({
      type: 'request',
      id: randomUUID(),
      operation: 'raw',
      input: { kind: 'release', source: { workspaceId, relativePath: 'a.json' as RelativePath } },
    })
    broker.accept({
      type: 'response',
      id: sent[1].id,
      result: { ok: true, value: { released: false } },
    })
    expect(await released).toEqual({ released: false })
    const invalid = broker
      .request({ type: 'request', id: randomUUID(), operation: 'raw', input })
      .catch((error) => error.code)
    broker.accept({
      type: 'response',
      id: sent[2].id,
      result: {
        ok: true,
        value: {
          ...value,
          items: [
            { kind: 'source', name: 'a.json', source: { workspaceId, relativePath: 'wrong.json' } },
          ],
        },
      },
    })
    expect(await invalid).toBe('PROTOCOL_ERROR')
  })
  it('uses independent response limits and owner-scoped cancellation without changing control limits', async () => {
    const sent: Request[] = [],
      broker = new RequestBroker((request) => sent.push(request))
    const input = command(),
      id = randomUUID()
    const request: Request = { type: 'request', id, operation: 'raw', input }
    const pending = broker.request<NodeResult>(request, 7)
    expect(sent[0].id).not.toBe(id)
    expect(await broker.cancel(id, 8)).toEqual({ accepted: false })
    const cancellation = broker.cancel(id, 7)
    expect(sent[1]).toMatchObject({ operation: 'cancel', targetId: sent[0].id })
    broker.accept({
      type: 'response',
      id: sent[1].id,
      result: { ok: true, value: { accepted: true } },
    })
    expect(await cancellation).toEqual({ accepted: true })
    const value: NodeResult = {
      mode: 'complete',
      node: {
        address: input.address,
        revision: input.expectedRevision,
        kind: 'string',
        range: { startByte: 0, endByteExclusive: 20002 },
        childCount: null,
        preview: 'a',
        truncated: false,
      },
      value: { kind: 'string', value: 'a'.repeat(20000) },
    }
    const response = { type: 'response', id: sent[0].id, result: { ok: true, value } }
    expect(byteSize(response)).toBeGreaterThan(16 * 1024)
    expect(byteSize(response)).toBeLessThan(RAW_LIMITS.responseBytes)
    broker.accept(response)
    expect(await pending).toEqual(value)
  })
  it('preserves machine-readable resource details and rejects mismatched result context', async () => {
    const sent: Request[] = [],
      broker = new RequestBroker((request) => sent.push(request))
    const first = broker
      .request({ type: 'request', id: randomUUID(), operation: 'raw', input: command() })
      .catch((error) => error)
    broker.accept({
      type: 'response',
      id: sent[0].id,
      result: { ok: false, error: { code: 'RESOURCE_LIMIT', details: { limit: 'TOKEN_BYTES' } } },
    })
    expect(await first).toMatchObject({ code: 'RESOURCE_LIMIT', details: { limit: 'TOKEN_BYTES' } })
    const input = command(),
      second = broker
        .request({ type: 'request', id: randomUUID(), operation: 'raw', input })
        .catch((error) => error)
    broker.accept({
      type: 'response',
      id: sent[1].id,
      result: {
        ok: true,
        value: {
          mode: 'summary',
          node: {
            address: input.address,
            revision: randomUUID(),
            kind: 'array',
            range: null,
            childCount: null,
            preview: null,
            truncated: true,
          },
        },
      },
    })
    expect(await second).toMatchObject({ code: 'PROTOCOL_ERROR' })
    expect(broker.isAvailable).toBe(false)
  })
})
