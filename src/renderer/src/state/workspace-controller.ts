import { readonly, writable } from 'svelte/store'
import type { RawBridge, WorkspaceId } from '../../../shared/raw'
import { ExplorerController } from '../explorer/explorer-controller'
import { SourceSession } from './source-session'
import { errorOf, RequestFailure } from './requests'
import type { UiError } from './requests'

export type WorkspaceState = {
  status: 'closed' | 'opening' | 'open' | 'error'
  workspaceId: WorkspaceId | null
  displayName: string
  epoch: number
  error: UiError | null
}
export class WorkspaceController {
  private state: WorkspaceState = {
    status: 'closed',
    workspaceId: null,
    displayName: '',
    epoch: 0,
    error: null,
  }
  private store = writable(this.state)
  readonly changes = readonly(this.store)
  readonly explorer: ExplorerController
  readonly session: SourceSession
  constructor(private readonly bridge: RawBridge) {
    this.explorer = new ExplorerController(bridge)
    this.session = new SourceSession(bridge)
  }
  get snapshot(): WorkspaceState {
    return this.state
  }
  private publish(change: Partial<WorkspaceState>): void {
    this.state = { ...this.state, ...change }
    this.store.set(this.state)
  }
  async open(): Promise<void> {
    if (this.state.status === 'opening') return
    const previous = this.state
    this.publish({ status: 'opening', error: null })
    try {
      const result = await this.bridge.openWorkspace({ requestId: crypto.randomUUID() })
      if (!result.ok) throw new RequestFailure(result.error)
      if (result.value.status === 'cancelled') {
        this.publish(previous)
        return
      }
      this.session.reset()
      this.publish({
        status: 'open',
        epoch: previous.epoch + 1,
        workspaceId: result.value.workspaceId,
        displayName: result.value.displayName,
        error: null,
      })
      await this.explorer.open(result.value.workspaceId)
    } catch (error) {
      this.explorer.reset(null)
      this.session.reset()
      this.publish({
        status: 'error',
        epoch: previous.epoch + 1,
        workspaceId: null,
        displayName: '',
        error: errorOf(error),
      })
    }
  }
}
