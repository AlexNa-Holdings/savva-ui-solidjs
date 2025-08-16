// File: src/pages/Settings.jsx
// (only the DeveloperAssetsSection function changes below)

function DeveloperAssetsSection() {
  const {
    assetsEnv,
    setAssetsEnv,
    assetsBaseUrl,       // remote base (only used if source === "remote")
    domainAssetsPrefix,  // now the ACTIVE prefix (remote or /domain_default/)
    domainAssetsConfig,  // null when not loaded
    domainAssetsSource,  // "remote" | "default" | null
    selectedDomain,
  } = useApp();

  const onInput = (e) => setAssetsEnv(e.currentTarget.value);

  const domainName = () => {
    const d = selectedDomain();
    if (!d) return "";
    return typeof d === "string" ? d : (d.name || "");
  };

  // Show the base according to the active source
  const baseForDisplay = () =>
    domainAssetsSource?.() === "remote" ? (assetsBaseUrl() || "—") : "/domain_default/";

  const configStatus = () => (domainAssetsConfig() ? "loaded" : "none");

  return (
    <section class="space-y-3">
      <h4 class="text-base font-semibold">Domain assets</h4>

      <div class="flex items-center gap-4">
        <label class="inline-flex items-center gap-2">
          <input
            type="radio"
            name="assets-env"
            value="prod"
            checked={assetsEnv() === "prod"}
            onInput={onInput}
          />
          <span>prod</span>
        </label>
        <label class="inline-flex items-center gap-2">
          <input
            type="radio"
            name="assets-env"
            value="test"
            checked={assetsEnv() === "test"}
            onInput={onInput}
          />
          <span>test</span>
        </label>
      </div>

      <dl class="text-sm grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
        <dt class="font-medium">Domain:</dt>
        <dd>{domainName() || "—"}</dd>

        <dt class="font-medium">Source:</dt>
        <dd>{domainAssetsSource?.() || "—"}</dd>

        <dt class="font-medium">Base URL:</dt>
        <dd>{baseForDisplay()}</dd>

        <dt class="font-medium">Prefix:</dt>
        <dd>{domainAssetsPrefix() || "—"}</dd>

        <dt class="font-medium">Config:</dt>
        <dd>{configStatus()}</dd>
      </dl>
    </section>
  );
}
