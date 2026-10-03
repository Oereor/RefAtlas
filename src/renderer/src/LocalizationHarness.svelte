<script lang="ts">
  import { uiLocale, messages, formatUiCount, formatRawError } from './i18n'
  import { localizationRawFixture } from './localization-fixture'

  let count = $state(0)
  const token = crypto.randomUUID()
</script>

<section id="i18n-harness" data-token={token} data-count={count} data-locale={$uiLocale}>
  <button
    id="i18n-counter"
    aria-label={messages.common_retry({}, { locale: $uiLocale })}
    title={messages.common_reload({}, { locale: $uiLocale })}
    onclick={() => (count += 1)}
    >{messages.common_item_count(
      { count: formatUiCount(count, $uiLocale) },
      { locale: $uiLocale },
    )}</button
  >
  <p id="i18n-status" aria-live="polite">
    {messages.status_loading({}, { locale: $uiLocale })}
  </p>
  <p id="i18n-error">{formatRawError(localizationRawFixture, $uiLocale).message}</p>
  <p id="i18n-fallback">{messages.diagnostics_fallback_probe({}, { locale: $uiLocale })}</p>
  <pre id="i18n-raw">{JSON.stringify(localizationRawFixture)}</pre>
</section>
