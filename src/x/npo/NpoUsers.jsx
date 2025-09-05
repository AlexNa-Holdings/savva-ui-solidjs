// src/x/npo/NpoUsers.jsx
import { Show, For } from "solid-js";
import UserCard from "../ui/UserCard.jsx";
import Spinner from "../ui/Spinner.jsx";
import { EditIcon } from "../ui/icons/ActionIcons.jsx";

function Badge({ ok }) {
  return (
    <span
      class="inline-flex items-center justify-center w-6 h-6 rounded border text-xs"
      classList={{
        "bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] border-[hsl(var(--secondary))]": ok,
        "text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]": !ok,
      }}
      title={ok ? "Yes" : "No"}
    >
      {ok ? "✓" : "—"}
    </span>
  );
}

export default function NpoUsers(props) {
  const { t } = props;

  return (
    <>
      <div class="flex items-center justify-between px-3 py-2 border-b border-[hsl(var(--border))]">
        <div class="text-sm opacity-80">{t("npo.page.members.title")}</div>
        <Show when={props.selfIsAdmin}>
          <button
            type="button"
            class="w-8 h-8 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))] text-lg leading-none"
            title={t("npo.page.members.add")}
            aria-label={t("npo.page.members.add")}
            onClick={props.onOpenAdd}
          >
            +
          </button>
        </Show>
      </div>

      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
            <tr>
              <th class="px-3 py-2 text-left">{t("npo.page.members.col.user")}</th>
              <th class="px-3 py-2 text-left">{t("npo.page.members.col.confirmed")}</th>
              <th class="px-3 py-2 text-left">{t("npo.page.members.col.roles")}</th>
              <th class="px-3 py-2 text-left">{t("npo.page.members.col.tokenLimits")}</th>
              <th class="px-3 py-2 text-left">{t("npo.page.members.col.admin")}</th>
              <Show when={props.selfIsAdmin}>
                <th class="px-3 py-2 text-left">{t("npo.page.members.col.actions")}</th>
              </Show>
            </tr>
          </thead>
          <tbody>
            <Show when={!props.membersLoading && props.members.length === 0}>
              <tr>
                <td colSpan={props.selfIsAdmin ? 6 : 5} class="px-3 py-8 text-center text-[hsl(var(--muted-foreground))]">
                  {t("npo.page.members.empty")}
                </td>
              </tr>
            </Show>

            <For each={props.members}>
              {(m) => {
                const addr = m.user?.address || m.address;
                const isSelf = String(addr || "").toLowerCase() === String(props.meAddr || "").toLowerCase();
                const busy = props.isAdminBusy(addr);
                const disabledSwitch = isSelf || !props.selfIsAdmin || busy;
                const _epoch = props.refreshEpoch; // used to recompute after refresh

                return (
                  <tr class="border-t border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]">
                    <td class="px-3 py-2"><UserCard author={m.user} compact /></td>
                    <td class="px-3 py-2"><Badge ok={m.confirmed} /></td>
                    <td class="px-3 py-2">
                      <Show when={(m.roles?.length || 0) > 0} fallback={<span class="opacity-60">—</span>}>
                        <div class="flex flex-wrap items-center gap-1">
                          <For each={m.roles}>
                            {(r) => (
                              <span class="px-2 py-0.5 text-xs rounded bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
                                {r}
                              </span>
                            )}
                          </For>
                          <Show when={props.selfIsAdmin}>
                            <button
                              type="button"
                              class="ml-2 p-1 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]"
                              title={t("npo.page.members.editRoles")}
                              aria-label={t("npo.page.members.editRoles")}
                              onClick={() => props.onOpenEdit(addr, m.user || null)}
                            >
                              <EditIcon class="w-4 h-4" />
                            </button>
                          </Show>
                        </div>
                      </Show>
                    </td>

                    {/* Limits placeholder */}
                    <td class="px-3 py-2"><span class="opacity-60">—</span></td>

                    {/* Admin switch */}
                    <td class="px-3 py-2">
                      <input
                        type="checkbox"
                        class="accent-[hsl(var(--primary))]"
                        aria-label={t("npo.page.members.adminFlag")}
                        checked={!!m.isAdmin}
                        disabled={disabledSwitch}
                        onChange={(e) => props.onToggleAdmin(addr, e.currentTarget.checked)}
                      />
                    </td>

                    <Show when={props.selfIsAdmin}>
                      <td class="px-3 py-2">
                        <span class="opacity-60">—</span>
                      </td>
                    </Show>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>

        <Show when={props.membersLoading}>
          <div class="flex justify-center p-4"><Spinner /></div>
        </Show>
      </div>
    </>
  );
}
