// src/x/modals/AddSupportedTokenModal.jsx
import { createSignal, createEffect, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { useApp } from "../../context/AppContext.jsx";
import SavvaNPOAbi from "../../blockchain/abi/SavvaNPO.json";
import { sendAsUser } from "../../blockchain/npoMulticall.js";
import { getTokenInfo } from "../../blockchain/tokenMeta.jsx";
import { pushToast, pushErrorToast } from "../../ui/toast.js";
import Spinner from "../ui/Spinner.jsx";
import Modal from "./Modal.jsx";

const isHexAddress = (s) => /^0x[0-9a-fA-F]{40}$/.test(String(s || "").trim());
const norm = (a) => String(a || "").trim().toLowerCase();

export default function AddSupportedTokenModal(props) {
  const app = useApp();
  const { t } = app;

  const [addr, setAddr] = createSignal("");
  const [preview, setPreview] = createSignal(null); // { symbol, decimals, Icon }
  const [previewing, setPreviewing] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);

  createEffect(() => {
    if (!props.isOpen) {
      setAddr("");
      setPreview(null);
      setPreviewing(false);
      setSubmitting(false);
    }
  });

  let previewToken = 0;
  createEffect(async () => {
    const a = addr().trim();
    setPreview(null);
    if (!isHexAddress(a)) return;
    const myToken = ++previewToken;
    setPreviewing(true);
    try {
      const info = await getTokenInfo(app, a);
      if (myToken === previewToken) setPreview(info);
    } catch {
      if (myToken === previewToken) setPreview(null);
    } finally {
      if (myToken === previewToken) setPreviewing(false);
    }
  });

  const isDup = () => {
    const a = norm(addr());
    if (!a) return false;
    return (props.existing || []).some((e) => norm(e) === a);
  };

  const canSubmit = () => isHexAddress(addr()) && !isDup() && !submitting();

  function close() {
    if (submitting()) return;
    props.onClose?.();
  }

  async function onAdd() {
    if (!canSubmit()) return;
    if (!props.npoAddr) {
      pushErrorToast({ message: t("errors.missingParam") });
      return;
    }
    try {
      setSubmitting(true);
      await sendAsUser(app, {
        target: props.npoAddr,
        abi: SavvaNPOAbi,
        functionName: "addSupportedToken",
        args: [addr().trim()],
      });
      pushToast({ type: "success", message: t("npo.tokens.added") });
      props.onAdded?.();
      close();
    } catch (e) {
      pushErrorToast({ message: e?.message || t("errors.updateFailed") });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={close}
      size="lg"
      title={t("npo.tokens.add.title")}
      footer={
        <div class="flex items-center justify-end gap-2">
          <button
            class="px-3 py-1.5 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]"
            onClick={close}
            disabled={submitting()}
          >
            {t("common.cancel")}
          </button>
          <button
            class="px-3 py-1.5 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
            onClick={onAdd}
            disabled={!canSubmit()}
          >
            {submitting() ? t("common.working") : t("npo.tokens.add.submit")}
          </button>
        </div>
      }
    >
      <div class="space-y-3">
        <div>
          <label class="block text-sm mb-1">{t("npo.tokens.add.addressLabel")}</label>
          <input
            type="text"
            class="w-full px-3 py-2 rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] font-mono text-sm"
            placeholder="0x…"
            value={addr()}
            onInput={(e) => setAddr(e.currentTarget.value)}
            spellcheck={false}
            autocomplete="off"
          />
          <Show when={addr() && !isHexAddress(addr())}>
            <p class="mt-1 text-sm text-[hsl(var(--destructive))]">{t("errors.invalidAddress")}</p>
          </Show>
          <Show when={isHexAddress(addr()) && isDup()}>
            <p class="mt-1 text-sm text-[hsl(var(--destructive))]">{t("npo.tokens.add.duplicate")}</p>
          </Show>
        </div>

        <Show when={isHexAddress(addr())}>
          <div class="rounded border border-[hsl(var(--border))] p-3 bg-[hsl(var(--background))]">
            <div class="text-xs opacity-70 mb-1">{t("npo.tokens.add.preview")}</div>
            <Show when={!previewing()} fallback={<div class="py-1"><Spinner /></div>}>
              <Show when={preview()} fallback={<div class="text-sm opacity-70">{t("npo.tokens.add.unknown")}</div>}>
                <div class="flex items-center gap-2">
                  <Show when={preview().Icon}>
                    <Dynamic component={preview().Icon} class="w-5 h-5" />
                  </Show>
                  <span class="font-medium">{preview().symbol}</span>
                  <span class="text-xs opacity-70">· {preview().decimals} {t("npo.tokens.col.decimals")}</span>
                </div>
              </Show>
            </Show>
          </div>
        </Show>
      </div>
    </Modal>
  );
}
