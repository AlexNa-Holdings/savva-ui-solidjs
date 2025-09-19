// src/x/npo/NpoUsers.jsx
import { Show, For, createSignal, createEffect, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { createPublicClient, http, getContract } from "viem";
import SavvaNPOAbi from "../../blockchain/abi/SavvaNPO.json";

import UserCard from "../ui/UserCard.jsx";
import Spinner from "../ui/Spinner.jsx";
import { EditIcon, TrashIcon } from "../ui/icons/ActionIcons.jsx";
import Modal from "../modals/Modal.jsx";

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

const norm = (a) => String(a || "").toLowerCase();

export default function NpoUsers(props) {
  const app = useApp();
  const { t } = props;

  // Local admin resolution (fallback if parent didn't pass selfIsAdmin)
  const [localIsAdmin, setLocalIsAdmin] = createSignal(false);
  const [adminResolving, setAdminResolving] = createSignal(false);

  const me = createMemo(() => norm(props.meAddr));
  const npo = createMemo(() => props.npoAddr || ""); // optional but preferred when self-resolving

  const effIsAdmin = createMemo(() =>
    typeof props.selfIsAdmin === "boolean" ? props.selfIsAdmin : localIsAdmin()
  );

  // Resolve admin locally if parent didn't provide it
  createEffect(async () => {
    if (typeof props.selfIsAdmin === "boolean") return; // trust parent
    const meAddr = me();
    const npoAddr = npo();
    if (!meAddr || !npoAddr) {
      setLocalIsAdmin(false);
      return;
    }
    try {
      setAdminResolving(true);
      const chain = app.desiredChain?.();
      const pc = createPublicClient({ chain, transport: http(chain?.rpcUrls?.[0] ?? undefined) });
      const c = getContract({ address: npoAddr, abi: SavvaNPOAbi, client: pc });
      const yes = await c.read.isAdmin([meAddr]);
      setLocalIsAdmin(!!yes);
    } catch {
      setLocalIsAdmin(false);
    } finally {
      setAdminResolving(false);
    }
  });

  const [confirmOpen, setConfirmOpen] = createSignal(false);
  const [confirmAddr, setConfirmAddr] = createSignal("");

  const isActionBusy = (addr) =>
    (props.isActionBusy && props.isActionBusy(addr)) ||
    (props.isAdminBusy && props.isAdminBusy(addr)) ||
    false;

  const openDeleteConfirm = (addr) => { setConfirmAddr(addr); setConfirmOpen(true); };
  const closeDeleteConfirm = () => { setConfirmOpen(false); setConfirmAddr(""); };
  const confirmDelete = async () => {
    const addr = confirmAddr();
    if (!addr) return;
    try { await props.onRemoveMember?.(addr); } finally { closeDeleteConfirm(); }
  };

  return (
    <>
      <div class="flex items-center justify-between px-3 py-2 border-b border-[hsl(var(--border))]">
        <div class="text-sm opacity-80">{t("npo.page.members.title")}</div>
        <Show when={effIsAdmin()}>
          <button
            type="button"
            class="w-8 h-8 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))] text-lg leading-none"
            title={t("npo.page.members.add")}
            aria-label={t("npo.page.members.add")}
            onClick={props.onOpenAdd}
            disabled={adminResolving()}
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
              <th class="px-3 py-2 text-left">{t("npo.page.members.col.actions")}</th>
            </tr>
          </thead>

          <tbody>
            <Show when={!props.membersLoading && props.members.length === 0}>
              <tr>
                <td colSpan={6} class="px-3 py-8 text-center text-[hsl(var(--muted-foreground))]">
                  {t("npo.page.members.empty")}
                </td>
              </tr>
            </Show>

            <For each={props.members}>
              {(m) => {
                const addr = m.user?.address || m.address;
                const isSelf = norm(addr) === me();
                const adminToggleBusy = props.isAdminBusy && props.isAdminBusy(addr);
                // Admin switch disabled if: acting on self, not admin, or resolving/tx busy
                const disabledSwitch = isSelf || !effIsAdmin() || adminToggleBusy || adminResolving();
                const actionBusy = isActionBusy(addr);

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
                          <Show when={effIsAdmin()}>
                            <button
                              type="button"
                              class="ml-2 p-1 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]"
                              title={t("npo.page.members.editRoles")}
                              aria-label={t("npo.page.members.editRoles")}
                              onClick={() => props.onOpenEdit?.(addr, m.user || null)}
                              disabled={adminResolving()}
                            >
                              <EditIcon class="w-4 h-4" />
                            </button>
                          </Show>
                        </div>
                      </Show>
                    </td>

                    <td class="px-3 py-2"><span class="opacity-60">—</span></td>

                    <td class="px-3 py-2">
                      <input
                        type="checkbox"
                        class="accent-[hsl(var(--primary))]"
                        aria-label={t("npo.page.members.adminFlag")}
                        checked={!!m.isAdmin}
                        disabled={disabledSwitch}
                        onChange={(e) => props.onToggleAdmin?.(addr, e.currentTarget.checked)}
                      />
                    </td>

                    <td class="px-3 py-2">
                      <div class="flex items-center gap-2">
                        {/* Self: Confirm/Unconfirm (even if admin) */}
                        <Show when={isSelf && !m.confirmed}>
                          <button
                            type="button"
                            class="px-2 py-1 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]"
                            disabled={actionBusy}
                            title={t("npo.page.members.confirm")}
                            aria-label={t("npo.page.members.confirm")}
                            onClick={() => props.onConfirmMembership?.(addr)}
                          >
                            {t("common.confirm")}
                          </button>
                        </Show>

                        <Show when={isSelf && m.confirmed}>
                          <button
                            type="button"
                            class="px-2 py-1 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]"
                            disabled={actionBusy}
                            title={t("npo.page.members.unconfirm") || "Unconfirm"}
                            aria-label={t("npo.page.members.unconfirm") || "Unconfirm"}
                            onClick={() => props.onUnconfirmMembership?.(addr)}
                          >
                            {t("npo.page.members.unconfirm") || "Unconfirm"}
                          </button>
                        </Show>

                        {/* Admin-only delete; never self */}
                        <Show when={effIsAdmin() && !isSelf}>
                          <button
                            type="button"
                            class="p-1 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive-foreground))]"
                            disabled={actionBusy || adminResolving()}
                            title={t("npo.page.members.delete")}
                            aria-label={t("npo.page.members.delete")}
                            onClick={() => openDeleteConfirm(addr)}
                          >
                            <TrashIcon class="w-4 h-4" />
                          </button>
                        </Show>

                        {/* Idle dash */}
                        <Show when={!((isSelf) || (effIsAdmin() && !isSelf))}>
                          <span class="opacity-60">—</span>
                        </Show>
                      </div>
                    </td>
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

      {/* Confirm Delete Modal */}
      <Modal isOpen={confirmOpen()} onClose={closeDeleteConfirm}>
        <div class="p-4 space-y-3">
          <div class="text-lg font-semibold">{t("npo.page.members.deleteTitle")}</div>
          <div class="text-sm opacity-80">{t("npo.page.members.deleteConfirmText")}</div>
          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              class="px-3 py-1.5 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]"
              onClick={closeDeleteConfirm}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              class="px-3 py-1.5 rounded border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:opacity-90"
              disabled={isActionBusy(confirmAddr())}
              onClick={confirmDelete}
            >
              {t("common.delete")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
