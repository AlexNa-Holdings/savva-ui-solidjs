// src/x/settings/PinningServiceModal.jsx
import { createSignal, Show, createEffect, on } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

const PRESETS = {
  pinata: {
    name: "Pinata",
    apiUrl: "https://api.pinata.cloud/pinning/pinFileToIPFS",
    gatewayUrl: "https://gateway.pinata.cloud",
  },
  // filebase: {
  //   name: "Filebase",
  //   apiUrl: "https://api.filebase.io/v1/ipfs/pins",
  //   gatewayUrl: "https://ipfs.filebase.io",
  // },
  // '4everland': {
  //   name: "4EVERLAND",
  //   apiUrl: "https://api.4everland.dev/pinning/pins",
  //   gatewayUrl: "https://4everland.io",
  // },
};

export default function PinningServiceModal(props) {
  const { t } = useApp();
  const [name, setName] = createSignal("");
  const [apiUrl, setApiUrl] = createSignal("");
  const [apiKey, setApiKey] = createSignal("");
  const [gatewayUrl, setGatewayUrl] = createSignal("");
  const [preset, setPreset] = createSignal("custom");

  createEffect(on(() => props.service, (service) => {
    if (service) {
      setName(service.name || "");
      setApiUrl(service.apiUrl || "");
      setApiKey(service.apiKey || "");
      setGatewayUrl(service.gatewayUrl || "");
      setPreset("custom");
    } else {
      // Reset to default when adding a new one
      handlePresetChange("pinata");
    }
  }, { defer: true }));

  const handlePresetChange = (key) => {
    setPreset(key);
    const p = PRESETS[key];
    if (p) {
      setName(p.name);
      setApiUrl(p.apiUrl);
      setGatewayUrl(p.gatewayUrl);
      setApiKey("");
    } else {
      setName("");
      setApiUrl("");
      setGatewayUrl("");
      setApiKey("");
    }
  };

  const handleSave = () => {
    props.onSave?.({
      id: props.service?.id,
      name: name().trim(),
      apiUrl: apiUrl().trim(),
      apiKey: apiKey().trim(),
      gatewayUrl: gatewayUrl().trim(),
    });
  };

  const title = () => props.service ? t("settings.pinning.modal.editTitle") : t("settings.pinning.modal.addTitle");

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-[60] flex items-center justify-center">
        <div class="absolute inset-0 bg-black/40" onClick={props.onClose} />
        <div class="relative themed-dialog rounded-lg shadow-lg w-full max-w-lg p-4 bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]">
          <h3 class="text-lg font-semibold mb-4">{title()}</h3>
          <div class="space-y-3">
            <select
              value={preset()}
              onChange={(e) => handlePresetChange(e.currentTarget.value)}
              class="w-full px-3 py-2 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]"
            >
              <option value="custom" disabled>{t("settings.pinning.preset")}</option>
              <option value="pinata">{t("settings.pinning.preset.pinata")}</option>
              {/* <option value="filebase">{t("settings.pinning.preset.filebase")}</option> */}
              {/* <option value="4everland">{t("settings.pinning.preset.4everland")}</option> */}
            </select>
            <input type="text" value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder={t("settings.pinning.modal.name.placeholder")} class="w-full px-3 py-2 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]" />
            <input type="text" value={apiUrl()} onInput={(e) => setApiUrl(e.currentTarget.value)} placeholder={t("settings.pinning.modal.apiUrl.placeholder")} class="w-full px-3 py-2 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]" />
            <input type="password" value={apiKey()} onInput={(e) => setApiKey(e.currentTarget.value)} placeholder={t("settings.pinning.modal.apiKey.label")} class="w-full px-3 py-2 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]" />
            <div>
              <input type="text" value={gatewayUrl()} onInput={(e) => setGatewayUrl(e.currentTarget.value)} placeholder={t("settings.pinning.modal.gatewayUrl.placeholder")} class="w-full px-3 py-2 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]" />
              <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{t("settings.pinning.modal.gatewayUrl.help")}</p>
            </div>
          </div>
          <div class="flex gap-2 justify-end mt-4">
            <button onClick={props.onClose} class="px-3 py-2 rounded bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:opacity-90">{t("common.cancel")}</button>
            <button onClick={handleSave} class="px-3 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90">{t("settings.pinning.modal.save")}</button>
          </div>
        </div>
      </div>
    </Show>
  );
}