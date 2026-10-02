import type { FoundationBridge } from '../../shared/protocol'
declare global {
  interface Window { foundation: FoundationBridge; runFoundationSmoke?: () => Promise<unknown>; runFoundationGuardSmoke?: () => Promise<unknown> }
}
export {}
