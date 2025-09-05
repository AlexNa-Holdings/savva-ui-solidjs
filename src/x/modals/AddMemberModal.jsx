// src/x/modals/AddMemberModal.jsx
import { createSignal, Show, onMount, For } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { createPublicClient, http, getContract } from "viem";
import SavvaNPOAbi from "../../blockchain/abi/SavvaNPO.json";
import AddressInput from "../ui/AddressInput.jsx";
import Spinner from "../ui/Spinner.jsx";
import { pushToast, pushErrorToast } from "../../ui/toast.js";

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

export default function AddMemberModal(props) {
  const app = useApp();
  const { t } = app;

  const [addr, setAddr] = createSignal("");
  const [roles, setRoles] = createSignal([]); // [{value: bytes32, label: string}]
  const [selected, setSelected] = createSignal(new Set());
  const [loadingRoles, setLoadingRoles] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);

  function toggleRole(value) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
  }

  function selectedArray() {
    return Array.from(selected());
  }

  function close() {
    if (submitting()) return;
    props.onClose?.();
  }

  onMount(async () => {
    if (!props.npoAddr) return;
    try {
      setLoadingRoles(true);
      const chain = app.desiredChain?.();
      const publicClient = createPublicClient({
        chain,
        transport: http(chain?.rpcUrls?.[0] ?? undefined),
      });
      const c = getContract({ address: props.npoAddr, abi: SavvaNPOAbi, client: publicClient });
      const raw = await c.read.getRoleList();
      const list = (raw || []).map((b) => ({ value: b, label: bytes32ToString(b) || b }));
      setRoles(list);
    } catch (e) {
      pushErrorToast({ message: e?.message || t("errors.loadFailed") });
      setRoles([]);
    } finally {
      setLoadingRoles(false);
    }
  });

  async function onAdd() {
    if (submitting()) return;
    const member = addr()?.trim();
    if (!member) { pushErrorToast({ message: t("errors.invalidAddress") }); return; }

    try {
      setSubmitting(true);
      const client = await app.getGuardedWalletClient?.();
      if (!client) throw new Error("No wallet client");
      const c = getContract({ address: props.npoAddr, abi: SavvaNPOAbi, client });
      await c.write.addMember([member, selectedArray()]);
      pushToast({ type: "success", message: t("npo.addMember.added") });
      props.onAdded?.();
    } catch (e) {
      pushErrorToast({ message: e?.message || t("errors.updateFailed") });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-50" role="dialog" aria-modal="true">
        <div class="absolute inset-0 bg-black/40" onClick={close} />
        <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(560px,92vw)] rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))] shadow-xl">
          <div class="px-4 py-3 border-b border-[hsl(var(--border))] flex items-center justify-between">
            <h2 class="text-lg font-semibold">{t("npo.addMember.title")}</h2>
            <button class="w-8 h-8 rounded hover:bg-[hsl(var(--accent))]" onClick={close} aria-label={t("common.close")}>✕</button>
          </div>

          <div class="p-4 space-y-4">
            <div>
              <label class="block text-sm mb-1">{t("npo.addMember.addressLabel")}</label>
              <AddressInput value={addr()} onChange={setAddr} placeholder={t("npo.addMember.addressPlaceholder")} />
            </div>

            <div>
              <label class="block text-sm mb-2">{t("npo.addMember.rolesLabel")}</label>
              <Show when={!loadingRoles()} fallback={<div class="py-2"><Spinner /></div>}>
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
            <button
              class="px-3 py-1.5 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]"
              onClick={close}
              disabled={submitting()}
            >
              {t("npo.addMember.cancel")}
            </button>
            <button
              class="px-3 py-1.5 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
              onClick={onAdd}
              disabled={submitting()}
            >
              {submitting() ? t("common.working") : t("npo.addMember.add")}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
