import type { RawKind, RawScalar } from '../../../shared/raw'
import type { UiLocale } from '../i18n'
import { messages } from '../i18n'
export function kindLabel(kind: RawKind, locale: UiLocale): string {
  const labels = {
    object: messages.node_type_object,
    array: messages.node_type_array,
    string: messages.node_type_string,
    number: messages.node_type_number,
    boolean: messages.node_type_boolean,
    null: messages.node_type_null,
  }
  return labels[kind]({}, { locale })
}
export function scalarText(value: RawScalar): string {
  switch (value.kind) {
    case 'number':
      return value.lexeme
    case 'string':
      return value.value
    case 'boolean':
      return value.value ? 'true' : 'false'
    case 'null':
      return 'null'
  }
}
