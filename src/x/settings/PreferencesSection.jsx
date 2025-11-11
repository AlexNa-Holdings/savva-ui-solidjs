// src/x/settings/PreferencesSection.jsx
import { createSignal, For, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import {
  loadNsfwPreference,
  saveNsfwPreference,
  loadPredefinedAmounts,
  savePredefinedAmounts,
  onNsfwChanged,
  onAmountsChanged
} from "../preferences/storage.js";

export default function PreferencesSection() {
  const app = useApp();
  const { t } = app;

  const [nsfwPref, setNsfwPref] = createSignal(loadNsfwPreference());
  const [amounts, setAmounts] = createSignal(loadPredefinedAmounts());

  // Listen for external changes (e.g., from other tabs)
  const cleanupNsfw = onNsfwChanged((value) => {
    setNsfwPref(value);
  });

  const cleanupAmounts = onAmountsChanged((newAmounts) => {
    setAmounts([...newAmounts]);
  });

  onCleanup(() => {
    cleanupNsfw();
    cleanupAmounts();
  });

  const handleNsfwChange = (value) => {
    setNsfwPref(value);
    saveNsfwPreference(value);
  };

  const handleAmountChange = (index, value) => {
    const newAmounts = [...amounts()];
    newAmounts[index] = Number(value) || 0;
    setAmounts(newAmounts);
    savePredefinedAmounts(newAmounts);
  };

  return (
    <section class="space-y-4 p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <h3 class="text-lg font-semibold">{t("settings.preferences.title")}</h3>

      {/* NSFW Content Preference */}
      <div class="space-y-2">
        <label class="font-medium block">
          {t("settings.preferences.nsfw.label")}
        </label>
        <select
          value={nsfwPref()}
          onChange={(e) => handleNsfwChange(e.currentTarget.value)}
          class="w-full max-w-sm px-3 py-2 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]"
        >
          <option value="s">{t("settings.preferences.nsfw.show")}</option>
          <option value="w">{t("settings.preferences.nsfw.warn")}</option>
          <option value="h">{t("settings.preferences.nsfw.hide")}</option>
        </select>
        <p class="text-sm text-[hsl(var(--muted-foreground))]">
          {t("settings.preferences.nsfw.description")}
        </p>
      </div>

      {/* Predefined Amounts to Contribute to Post Fund */}
      <div class="space-y-2">
        <label class="font-medium block">
          {t("settings.preferences.amounts.label")}
        </label>
        <div class="flex gap-2 flex-wrap">
          <For each={amounts()}>
            {(amount, index) => (
              <input
                type="number"
                min="0"
                step="1"
                value={amount}
                onInput={(e) => handleAmountChange(index(), e.currentTarget.value)}
                class="w-24 px-2 py-1 text-center rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]"
                placeholder={t("settings.preferences.amounts.placeholder")}
              />
            )}
          </For>
        </div>
        <p class="text-sm text-[hsl(var(--muted-foreground))]">
          {t("settings.preferences.amounts.description")}
        </p>
      </div>
    </section>
  );
}
