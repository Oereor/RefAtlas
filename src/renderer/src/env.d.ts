import type { FoundationBridge } from '../../shared/protocol'
import type { RawBridge } from '../../shared/raw'
import type { AppPresentationConfig } from '../../shared/presentation'
declare global {
  interface Window {
    foundation: FoundationBridge
    raw: RawBridge
    readonly appPresentationConfig: AppPresentationConfig
    runFindSmoke?: (stage: string) => Promise<unknown>
    runFoundationSmoke?: () => Promise<unknown>
    runFoundationGuardSmoke?: () => Promise<unknown>
    runRawSmoke?: (stage: string) => Promise<unknown>
    runLocalizationSmoke?: (stage: string) => Promise<unknown>
    runExplorerSmoke?: (stage: string) => Promise<unknown>
    runNodeBrowserSmoke?: (stage: string) => Promise<unknown>
    runSourceLocatorSmoke?: (stage: string) => Promise<unknown>
  }
}
export {}
