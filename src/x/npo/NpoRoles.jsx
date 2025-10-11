// src/x/npo/NpoRoles.jsx
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import Spinner from "../ui/Spinner.jsx";
import ConfirmModal from "../modals/ConfirmModal.jsx";
import { createPublicClient, getContract } from "viem";
import { configuredHttp } from "../../blockchain/contracts.js";
import SavvaNPOAbi from "../../blockchain/abi/SavvaNPO.json";
import { sendAsUser } from "../../blockchain/npoMulticall.js";
import NpoRoleEditModal from "../modals/NpoRoleEditModal.jsx";

function bytes32ToString(hex) {
  if (!hex || typeof hex !== "string" || !hex.startsWith("0x")) return "";
  try {
    const bytes = new Uint8Array((hex.length - 2) / 2);
    for (let i = 2, j = 0; i < hex.length; i += 2, j++) bytes[j] = parseInt(hex.slice(i, i + 2), 16);
    let end = bytes.length; while (end > 0 && bytes[end - 1] === 0) end--;
    const dec = new TextDecoder().decode(bytes.subarray(0, end));
    return dec && /\S/.test(dec) ? dec : "";
  } catch { return ""; }
}

export default function NpoRoles(props) {
  const app = useApp();
  const { t } = app;

  const npoAddr = () => props.npoAddr;
  const isAdmin = () => !!props.selfIsAdmin;

  const [loading, setLoading] = createSignal(false);
  const [roles, setRoles] = createSignal([]); // [{hex, name, permCount}]
  const [confirmRemove, setConfirmRemove] = createSignal({ open: false, roleHex: "", roleName: "" });

  const [editorOpen, setEditorOpen] = createSignal(false);
  const [editorRole, setEditorRole] = createSignal(null); // {hex, name} | null for new

  async function load() {
    if (!npoAddr()) return;
    setLoading(true);
    try {
      const chain = app.desiredChain?.();
      const pc = createPublicClient({ chain, transport: configuredHttp(chain?.rpcUrls?.[0] ?? "") });
      const c = getContract({ address: npoAddr(), abi: SavvaNPOAbi, client: pc });

      const raw = await c.read.getRoleList();
      const list = await Promise.all(
        (raw || []).map(async (hex) => {
          let permCount = 0;
          try {
            const perms = await c.read.getRolePermissions([hex]);
            permCount = (perms || []).length;
          } catch {}
          return { hex, name: bytes32ToString(hex) || hex, permCount };
        })
      );
      setRoles(list);
    } catch (e) {
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }
  createEffect(load);

  async function removeRole(roleHex) {
    if (!npoAddr() || !roleHex) return;
    await sendAsUser(app, {
      target: npoAddr(),
      abi: SavvaNPOAbi,
      functionName: "removeRole",
      args: [roleHex],
    });
    await load();
  }

  const empty = createMemo(() => !loading() && roles().length === 0);

  return (
    <div class="p-3">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-lg font-semibold">{t("npo.roles.title")}</h3>
        <Show when={isAdmin()}>
          <button
            class="px-3 py-1.5 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
            onClick={() => { setEditorRole(null); setEditorOpen(true); }}
          >
            {t("npo.roles.add")}
          </button>
        </Show>
      </div>

      <Show when={!loading()} fallback={<div class="py-8 flex justify-center"><Spinner /></div>}>
        <Show when={!empty()} fallback={<div class="p-4 opacity-70">{t("npo.roles.empty")}</div>}>
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="text-left border-b border-[hsl(var(--border))]">
                  <th class="px-3 py-2">{t("npo.roles.col.role")}</th>
                  <th class="px-3 py-2">{t("npo.roles.col.permissions")}</th>
                  <th class="px-3 py-2 w-[220px]">{t("npo.roles.col.actions")}</th>
                </tr>
              </thead>
              <tbody>
                <For each={roles()}>
                  {(r) => (
                    <tr class="border-b border-[hsl(var(--border))]">
                      <td class="px-3 py-2 font-medium break-all">{r.name}</td>
                      <td class="px-3 py-2">{t("npo.roles.permCount", { n: r.permCount })}</td>
                      <td class="px-3 py-2">
                        <div class="flex gap-2">
                          <button
                            class="px-2 py-1 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]"
                            onClick={() => { setEditorRole({ hex: r.hex, name: r.name }); setEditorOpen(true); }}
                          >
                            {t("npo.roles.configure")}
                          </button>
                          <Show when={isAdmin()}>
                            <button
                              class="px-2 py-1 rounded border border-[hsl(var(--destructive))] text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive-foreground))]"
                              onClick={() => setConfirmRemove({ open: true, roleHex: r.hex, roleName: r.name })}
                            >
                              {t("npo.roles.remove")}
                            </button>
                          </Show>
                        </div>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>

      <NpoRoleEditModal
        isOpen={editorOpen()}
        onClose={() => setEditorOpen(false)}
        npoAddr={npoAddr()}
        role={editorRole()}
        onSaved={() => { setEditorOpen(false); load(); }}
      />

      <ConfirmModal
        isOpen={confirmRemove().open}
        onClose={() => setConfirmRemove({ open: false })}
        onConfirm={() => removeRole(confirmRemove().roleHex)}
        title={t("npo.roles.confirmDelete.title")}
        message={t("npo.roles.confirmDelete.message", { name: confirmRemove().roleName })}
      />
    </div>
  );
}
