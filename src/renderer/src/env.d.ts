import type { FoundationBridge } from '../../shared/protocol'
import type { RawBridge } from '../../shared/raw'
declare global {
  interface Window {
    foundation: FoundationBridge
    raw: RawBridge
    runFoundationSmoke?: () => Promise<unknown>
    runFoundationGuardSmoke?: () => Promise<unknown>
    runRawSmoke?: (stage: string) => Promise<unknown>
  }
}
export {}
