import type { FoundationBridge } from '../../shared/protocol'
import type { RawBridge } from '../../shared/raw'
import type { AppPresentationConfig } from '../../shared/presentation'
declare global {
  interface Window {
    foundation: FoundationBridge
    raw: RawBridge
    readonly appPresentationConfig: AppPresentationConfig
    runFoundationSmoke?: () => Promise<unknown>
    runFoundationGuardSmoke?: () => Promise<unknown>
    runRawSmoke?: (stage: string) => Promise<unknown>
    runLocalizationSmoke?: (stage: string) => Promise<unknown>
    runExplorerSmoke?: (stage: string) => Promise<unknown>
  }
}
export {}
