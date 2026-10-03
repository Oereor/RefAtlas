import type { UiLocale } from '../../../shared/presentation'
import * as messages from './generated/messages.js'

const errorMessages = new Map([
  ['WORKSPACE_NOT_OPEN', messages.error_workspace_not_open],
  ['NOT_FOUND', messages.error_not_found],
  ['SOURCE_CHANGED', messages.error_source_changed],
  ['STALE_CURSOR', messages.error_stale_cursor],
  ['INVALID_JSON', messages.error_invalid_json],
  ['RESOURCE_LIMIT', messages.error_resource_limit],
  ['ACCESS_DENIED', messages.error_access_denied],
  ['CANCELLED', messages.error_cancelled],
  ['BUSY', messages.error_busy],
  ['TIMEOUT', messages.error_timeout],
  ['SERVICE_UNAVAILABLE', messages.error_service_unavailable],
  ['SERVICE_EXIT', messages.error_service_exit],
  ['INTERNAL', messages.error_internal],
])

export function formatRawError(
  error: Readonly<{ code: string; details?: unknown }>,
  locale: UiLocale,
): Readonly<{ title: string; message: string }> {
  const responseLimit =
    error.code === 'RESOURCE_LIMIT' &&
    typeof error.details === 'object' &&
    error.details !== null &&
    'limit' in error.details &&
    error.details.limit === 'RESPONSE_BYTES'
  const message = responseLimit
    ? messages.error_response_bytes
    : (errorMessages.get(error.code) ?? messages.error_internal)
  return { title: messages.error_title({}, { locale }), message: message({}, { locale }) }
}
