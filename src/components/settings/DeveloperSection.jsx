// File: src/components/settings/DeveloperSection.jsx

import { Show } from "solid-js";
import { useApp } from "../../context/AppContext";
import { useNavigate } from "@solidjs/router";

// Same card style as Local IPFS
const CARD_CLS = "relative rounded-xl border border-slate-700 bg-slate-800 p-5 shadow";
const HEADER_CLS = "text-lg font-semibold mb-3";

export default function DeveloperSection() {
  const navigate = useNavigate();
  const {
    // domain assets
    assetsEnv,
    setAssetsEnv,
    assetsBaseUrl,
    domainAssetsPrefix,
    domainAssetsConfig,
    domainAssetsSource, // optional if exported
    selectedDomain,
    // i18n
    showKeys,
    setShowKeys,
  } = useApp();

  const onAssetsEnvInput = (e) => setAssetsEnv(e.currentTarget.value);

  const domainName = () => {
    const d = selectedDomain();
    if (!d) return "";
    return typeof d === "string" ? d : (d.name || "");
  };

  return (
    <section class={CARD_CLS}>
      {/* Header with back button on the right */}
      <div class="flex items-center justify-between mb-3">
        <h3 class={HEADER_CLS}>Developer</h3>
        <button
          type="button"
          class="text-slate-300 hover:text-white"
          title="Back"
          onClick={() => navigate(-1)}
        >
          {/* Simple left arrow icon (can replace with your preferred SVG/icon) */}
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Domain assets */}
      <div class="space-y-3">
        <h4 class="text-base font-semibold">Domain assets</h4>

        <div class="flex items-center gap-4">
          <label class="inline-flex items-center gap-2">
            <input
              type="radio"
              name="assets-env"
              value="prod"
              checked={assetsEnv() === "prod"}
              onInput={onAssetsEnvInput}
            />
            <span>prod</span>
          </label>
          <label class="inline-flex items-center gap-2">
            <input
              type="radio"
              name="assets-env"
              value="test"
              checked={assetsEnv() === "test"}
              onInput={onAssetsEnvInput}
            />
            <span>test</span>
          </label>
        </div>

        <dl class="text-sm grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
          <dt class="font-medium">Domain:</dt>
          <dd>{domainName() || "—"}</dd>

          <dt class="font-medium">Base URL:</dt>
          <dd>{assetsBaseUrl() || "—"}</dd>

          <dt class="font-medium">Prefix:</dt>
          <dd>{domainAssetsPrefix() || "—"}</dd>

          <dt class="font-medium">Config:</dt>
          <dd>
            <Show when={domainAssetsConfig()} fallback={<span>none</span>}>
              <span>loaded</span>
            </Show>
          </dd>

          <Show when={typeof domainAssetsSource === "function"}>
            <dt class="font-medium">Source:</dt>
            <dd>{domainAssetsSource?.() || "—"}</dd>
          </Show>
        </dl>
      </div>

      {/* i18n debugging */}
      <div class="space-y-2 mt-6">
        <h4 class="text-base font-semibold">i18n</h4>
        <label class="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!showKeys()}
            onInput={(e) => setShowKeys(e.currentTarget.checked)}
          />
          <span>Show translation keys</span>
        </label>
      </div>
    </section>
  );
}
