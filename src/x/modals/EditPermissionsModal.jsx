// src/x/modals/EditPermissionsModal.jsx
import { createSignal, Show, For, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { createPublicClient, http, getContract } from "viem";
import SavvaNPOAbi from "../../blockchain/abi/SavvaNPO.json";
import Spinner from "../ui/Spinner.jsx";
import UserCard from "../ui/UserCard.jsx";
import { pushErrorToast, pushToast } from "../../ui/toast.js";
import ModalAutoCloser from "../modals/ModalAutoCloser.jsx";
import ModalBackdrop from "../modals/ModalBackdrop.jsx";

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

export default function EditPermissionsModal(props) {
  const app = useApp();
  const { t } = app;

  const [loading, setLoading] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);

  // [{value: bytes32, label: string}]
  const [roles, setRoles] = createSignal([]);
  // Set<string(bytes32)>
  const [selected, setSelected] = createSignal(new Set());

  function toggleRole(value) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }
  function selectedArray() { return Array.from(selected()); }

  async function loadData() {
    if (!props.isOpen || !props.npoAddr || !props.memberAddress) return;
    setLoading(true);
    try {
      const chain = app.desiredChain?.();
      const publicClient = createPublicClient({
        chain,
        transport: http(chain?.rpcUrls?.[0] ?? undefined),
      });
      const c = getContract({ address: props.npoAddr, abi: SavvaNPOAbi, client: publicClient });

      const rawRoles = await c.read.getRoleList();
      const roleList = (rawRoles || []).map((b) => ({ value: b, label: bytes32ToString(b) || b }));
      setRoles(roleList);

      const current = await c.read.getMemberRoles([props.memberAddress]);
      // intersect only known roles
      const known = new Set(roleList.map((r) => r.value));
      const active = new Set((current || []).filter((v) => known.has(v)));
      setSelected(active);
    } catch (e) {
      pushErrorToast({ message: e?.message || t("errors.loadFailed") });
      setRoles([]);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }

  createEffect(loadData);

  async function apply() {
    if (submitting()) return;
    try {
      setSubmitting(true);
      const client = await app.getGuardedWalletClient?.();
      if (!client) throw new Error(t("errors.walletRequired"));
      const c = getContract({ address: props.npoAddr, abi: SavvaNPOAbi, client });
      const txHash = await c.write.changeMemberRoles([props.memberAddress, selectedArray()]);
      const pc = createPublicClient({ chain: app.desiredChain?.(), transport: http(app.desiredChain()?.rpcUrls?.[0] ?? undefined) });
      if (pc && txHash) await pc.waitForTransactionReceipt({ hash: txHash });
      pushToast({ type: "success", message: t("npo.editPerms.updated") || "Rules updated" });
      props.onChanged?.();
    } catch (e) {
      pushErrorToast({ message: e?.message || t("errors.updateFailed") });
    } finally {
      setSubmitting(false);
    }
  }

  function close() {
    if (submitting()) return;
    props.onClose?.();
  }

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-50" role="dialog" aria-modal="true">
       <ModalBackdrop onClick={props.onClose} />
        <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(560px,92vw)] rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))] shadow-xl">
          <div class="px-4 py-3 border-b border-[hsl(var(--border))] flex items-center justify-between">
            <ModalAutoCloser onClose={props.onClose} />
            <h2 class="text-lg font-semibold">{t("npo.editPerms.title") || "Edit Permissions"}</h2>
            <button class="w-8 h-8 rounded hover:bg-[hsl(var(--accent))]" onClick={close} aria-label={t("common.close")}>✕</button>
          </div>

          <div class="p-4 space-y-4">
            <Show when={props.user}>
              <div class="rounded border border-[hsl(var(--border))] p-2 bg-[hsl(var(--card))]">
                <UserCard author={props.user} compact />
              </div>
            </Show>

            <div>
              <label class="block text-sm mb-2">{t("npo.addMember.rolesLabel")}</label>
              <Show when={!loading()} fallback={<div class="py-2"><Spinner /></div>}>
                <Show when={roles().length > 0} fallback={<div class="text-sm opacity-70">{t("npo.addMember.noRoles")}</div>}>
                  <div class="flex flex-wrap gap-2">
                    <For each={roles()}>
                      {(r) => (
                        <label class="inline-flex items-center gap-2 px-2 py-1 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))] cursor-pointer">
                          <input
                            type="checkbox"
                            class="accent-[hsl(var(--primary))]"
                            checked={selected().has(r.value)}
                            onInput={() => toggleRole(r.value)}
                          />
                          <span class="text-sm">{r.label}</span>
                        </label>
                      )}
                    </For>
                  </div>
                </Show>
              </Show>
            </div>
          </div>

          <div class="px-4 py-3 border-t border-[hsl(var(--border))] flex items-center justify-end gap-2">
            <button class="px-3 py-1.5 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]" onClick={close}>
              {t("npo.addMember.cancel")}
            </button>
            <button
              class="px-3 py-1.5 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
              onClick={apply}
              disabled={submitting() || loading()}
              title={submitting() ? t("common.working") : (t("npo.editPerms.apply") || "Set Rules")}
            >
              {submitting() ? t("common.working") : (t("npo.editPerms.apply") || "Set Rules")}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
