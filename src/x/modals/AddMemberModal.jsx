// src/x/modals/AddMemberModal.jsx
import { createSignal, Show, onMount, For } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { createPublicClient, getContract } from "viem";
import { configuredHttp } from "../../blockchain/contracts.js";
import SavvaNPOAbi from "../../blockchain/abi/SavvaNPO.json";
import AddressInput from "../ui/AddressInput.jsx";
import Spinner from "../ui/Spinner.jsx";
import { pushToast, pushErrorToast } from "../../ui/toast.js";
import { sendAsUser } from "../../blockchain/npoMulticall.js";
import Modal from "./Modal.jsx";

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

  const [addr, setAddr] = createSignal("");
  const [roles, setRoles] = createSignal([]); // [{value: bytes32, label: string}]
  const [selected, setSelected] = createSignal(new Set());
  const [loadingRoles, setLoadingRoles] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);

  function toggleRole(value) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  }
  const selectedArray = () => Array.from(selected());

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
        transport: configuredHttp(chain?.rpcUrls?.[0] ?? ""),
      });
      const c = getContract({ address: props.npoAddr, abi: SavvaNPOAbi, client: publicClient });
      const raw = await c.read.getRoleList();
      const list = (raw || []).map((b) => ({ value: b, label: bytes32ToString(b) || b }));
      setRoles(list);
    } catch (e) {
      pushErrorToast({ message: e?.message || app.t("errors.loadFailed") });
      setRoles([]);
    } finally {
      setLoadingRoles(false);
    }
  });

  // NPO configuration must be executed "as user" (msg.sender = admin EOA)
  async function onAdd() {
    if (submitting()) return;
    const member = addr()?.trim();
    if (!props.npoAddr) { pushErrorToast({ message: app.t("errors.missingParam") }); return; }
    if (!member) { pushErrorToast({ message: app.t("errors.invalidAddress") }); return; }

    try {
      setSubmitting(true);

      await sendAsUser(app, {
        target: props.npoAddr,
        abi: SavvaNPOAbi,
        functionName: "addMember",
        args: [member, selectedArray()],
      });

      pushToast({ type: "success", message: app.t("npo.addMember.added") });
      props.onAdded?.();
      close();
    } catch (e) {
      pushErrorToast({ message: e?.message || app.t("errors.updateFailed") });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={close}
      size="xl"
      title={app.t("npo.addMember.title")}
      footer={
        <div class="flex items-center justify-end gap-2">
          <button
            class="px-3 py-1.5 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]"
            onClick={close}
            disabled={submitting()}
          >
            {app.t("npo.addMember.cancel")}
          </button>
          <button
            class="px-3 py-1.5 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
            onClick={onAdd}
            disabled={submitting()}
          >
            {submitting() ? { toString: () => app.t("common.working") } : app.t("npo.addMember.add")}
          </button>
        </div>
      }
    >
      <div class="space-y-4">
        <div>
          <label class="block text-sm mb-1">{app.t("npo.addMember.addressLabel")}</label>
          <AddressInput value={addr()} onChange={setAddr} placeholder={app.t("npo.addMember.addressPlaceholder")} />
        </div>

        <div>
          <label class="block text-sm mb-2">{app.t("npo.addMember.rolesLabel")}</label>
          <Show when={!loadingRoles()} fallback={<div class="py-2"><Spinner /></div>}>
            <Show when={roles().length > 0} fallback={<div class="text-sm opacity-70">{app.t("npo.addMember.noRoles")}</div>}>
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
    </Modal>
  );
}
