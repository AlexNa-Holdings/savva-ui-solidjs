// src/x/profile/LinksEditor.jsx
import { For, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import formSocialLink from "./formSocialLink.jsx";

function isValidUrl(u) {
  try {
    if (!u) return true;
    const x = new URL(u);
    return !!x.protocol && !!x.host;
  } catch {
    return false;
  }
}

export default function LinksEditor(props) {
  const app = useApp();
  const { t } = app;
  const links = () => (Array.isArray(props.value) ? props.value : []);

  const update = (idx, field, val) => {
    const next = links().map((row, i) => (i === idx ? { ...row, [field]: val } : row));
    props.onChange?.(next);
  };
  const add = () => props.onChange?.([...(links() || []), { title: "", url: "" }]);
  const removeAt = (idx) => props.onChange?.(links().filter((_, i) => i !== idx));

  return (
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h4 class="font-medium">{t("profile.edit.links.title")}</h4>
        <button
          type="button"
          class="px-3 py-1.5 rounded bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] hover:opacity-90"
          onClick={add}
        >
          {t("profile.edit.links.add")}
        </button>
      </div>

      <div class="overflow-x-auto rounded border border-[hsl(var(--border))]">
        <table class="min-w-full text-sm">
          <thead class="bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
            <tr>
              <th class="px-3 py-2 text-left w-[28%]">{t("profile.edit.links.col.title")}</th>
              <th class="px-3 py-2 text-left w-[44%]">{t("profile.edit.links.col.url")}</th>
              <th class="px-3 py-2 text-left w-[20%]">{t("profile.edit.links.col.preview")}</th>
              <th class="px-2 py-2 w-[8%]"></th>
            </tr>
          </thead>
          <tbody>
            <For each={links()}>
              {(row, idx) => {
                const bad = () => !isValidUrl(row?.url);
                return (
                  <tr class="border-t border-[hsl(var(--border))] align-top">
                    <td class="px-3 py-2">
                      <input
                        type="text"
                        value={row?.title || ""}
                        onInput={(e) => update(idx(), "title", e.currentTarget.value)}
                        class="w-full px-2 py-1 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]"
                      />
                    </td>
                    <td class="px-3 py-2">
                      <input
                        type="text"
                        value={row?.url || ""}
                        onInput={(e) => update(idx(), "url", e.currentTarget.value)}
                        placeholder={t("profile.edit.links.urlPlaceholder")}
                        class="w-full px-2 py-1 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]"
                      />
                      <Show when={bad()}>
                        <div class="mt-1 text-xs text-[hsl(var(--destructive))]">
                          {t("profile.edit.links.invalidUrl")}
                        </div>
                      </Show>
                    </td>
                    <td class="px-3 py-2">
                      {formSocialLink(row?.title || "", row?.url || "", {
                        class: "inline-flex items-center gap-1.5 underline hover:opacity-80 break-all",
                        iconClass: "w-6 h-6",
                      })}
                    </td>
                    <td class="px-2 py-2">
                      <button
                        type="button"
                        class="px-2 py-1 rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]"
                        onClick={() => removeAt(idx())}
                      >
                        {t("profile.edit.links.remove")}
                      </button>
                    </td>
                  </tr>
                );
              }}
            </For>

            <Show when={!links() || links().length === 0}>
              <tr>
                <td colSpan="4" class="px-3 py-4 text-sm text-[hsl(var(--muted-foreground))]">
                  {t("profile.edit.links.empty")}
                </td>
              </tr>
            </Show>
          </tbody>
        </table>
      </div>
    </div>
  );
}
