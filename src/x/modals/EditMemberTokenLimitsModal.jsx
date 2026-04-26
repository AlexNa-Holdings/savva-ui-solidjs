// src/x/modals/EditMemberTokenLimitsModal.jsx
import { For, Show, createEffect, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { Dynamic } from "solid-js/web";
import { useApp } from "../../context/AppContext.jsx";
import SavvaNPOAbi from "../../blockchain/abi/SavvaNPO.json";
import { sendAsUser } from "../../blockchain/npoMulticall.js";
import { getTokenInfo } from "../../blockchain/tokenMeta.jsx";
import { formatAmountWithDecimals } from "../../blockchain/tokenAmount.js";
import Spinner from "../ui/Spinner.jsx";
import UserCard from "../ui/UserCard.jsx";
import AmountInput from "../ui/AmountInput.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import Modal from "./Modal.jsx";
import { pushToast, pushErrorToast } from "../../ui/toast.js";

export default function EditMemberTokenLimitsModal(props) {
  const app = useApp();
  const { t } = app;

  // Store-backed array so per-row mutations don't replace row identity (preserves input focus).
  const [rows, setRows] = createStore([]);
  const [loadingMeta, setLoadingMeta] = createSignal(false);
  const [savingAddr, setSavingAddr] = createSignal("");
  const [progress, setProgress] = createSignal({ done: 0, total: 0 });

  createEffect(async () => {
    if (!props.isOpen) {
      setRows([]);
      setSavingAddr("");
      setProgress({ done: 0, total: 0 });
      return;
    }
    const tokens = props.tokens || [];
    setLoadingMeta(true);
    try {
      const enriched = await Promise.all(
        tokens.map(async (tk) => {
          const meta = await getTokenInfo(app, tk.address).catch(() => null);
          const decimals = Number(meta?.decimals ?? 18);
          const initial = formatAmountWithDecimals(tk.limit ?? 0n, decimals);
          return {
            token: tk.address,
            limit: tk.limit ?? 0n,
            spent: tk.spent ?? 0n,
            symbol: meta?.symbol || "TOK",
            decimals,
            Icon: meta?.Icon || null,
            initial,
            input: initial,
            wei: tk.limit ?? 0n,
            invalid: false,
          };
        })
      );
      setRows(enriched);
    } finally {
      setLoadingMeta(false);
    }
  });

  function close() {
    if (savingAddr()) return;
    props.onClose?.();
  }

  function changedRows() {
    return rows.filter((r) => !r.invalid && String(r.input || "").trim() !== String(r.initial || "").trim());
  }

  const allValid = () => rows.every((r) => !r.invalid);
  const canSave = () =>
    !loadingMeta() &&
    !savingAddr() &&
    allValid() &&
    changedRows().length > 0 &&
    !!props.npoAddr &&
    !!props.memberAddress;

  async function onSave() {
    if (!canSave()) return;
    const changes = changedRows();
    setProgress({ done: 0, total: changes.length });
    try {
      for (const row of changes) {
        try {
          setSavingAddr(row.token);
          await sendAsUser(app, {
            target: props.npoAddr,
            abi: SavvaNPOAbi,
            functionName: "updateWeeklyLimit",
            args: [props.memberAddress, row.token, row.wei],
          });
          const idx = rows.findIndex((r) => r.token === row.token);
          if (idx >= 0) setRows(idx, { limit: row.wei, initial: row.input });
        } catch (e) {
          pushErrorToast({ message: e?.message || t("errors.updateFailed") });
          throw e;
        } finally {
          setProgress((p) => ({ done: p.done + 1, total: p.total }));
        }
      }
      pushToast({ type: "success", message: t("npo.limits.saved") });
      props.onSaved?.();
      close();
    } catch {
      // partial save: still notify parent so it can refresh its view
      props.onSaved?.();
    } finally {
      setSavingAddr("");
    }
  }

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={close}
      size="3xl"
      title={t("npo.limits.title")}
      footer={
        <div class="flex items-center justify-between gap-2">
          <Show when={savingAddr()} fallback={<span />}>
            <span class="text-xs opacity-70">
              {t("npo.limits.saving", { done: progress().done, total: progress().total })}
            </span>
          </Show>
          <div class="flex items-center gap-2">
            <button
              class="px-3 py-1.5 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]"
              onClick={close}
              disabled={!!savingAddr()}
            >
              {t("common.cancel")}
            </button>
            <button
              class="px-3 py-1.5 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
              onClick={onSave}
              disabled={!canSave()}
            >
              {savingAddr() ? t("common.working") : t("npo.limits.save")}
            </button>
          </div>
        </div>
      }
    >
      <div class="space-y-4">
        <Show when={props.user}>
          <div class="rounded border border-[hsl(var(--border))] p-2 bg-[hsl(var(--background))]">
            <UserCard author={props.user} compact />
          </div>
        </Show>

        <Show when={!loadingMeta()} fallback={<div class="py-4 flex justify-center"><Spinner /></div>}>
          <Show when={rows.length > 0} fallback={<div class="opacity-70 text-sm">{t("npo.limits.empty")}</div>}>
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="text-left border-b border-[hsl(var(--border))]">
                    <th class="px-2 py-2">{t("npo.limits.col.token")}</th>
                    <th class="px-2 py-2">{t("npo.limits.col.spent")}</th>
                    <th class="px-2 py-2 w-[280px]">{t("npo.limits.col.limit")}</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={rows}>
                    {(r, i) => {
                      const isSaving = () => savingAddr() === r.token;
                      const dirty = () =>
                        !r.invalid && String(r.input || "").trim() !== String(r.initial || "").trim();
                      return (
                        <tr class="border-b border-[hsl(var(--border))] align-top">
                          <td class="px-2 py-2">
                            <div class="flex items-center gap-2 min-w-0 pt-2">
                              <Show when={r.Icon}>
                                <Dynamic component={r.Icon} class="w-5 h-5 flex-shrink-0" />
                              </Show>
                              <span class="font-medium truncate">{r.symbol}</span>
                            </div>
                          </td>
                          <td class="px-2 py-2">
                            <div class="pt-2">
                              <TokenValue amount={r.spent} tokenAddress={r.token} />
                            </div>
                          </td>
                          <td class="px-2 py-2">
                            <div class="flex items-start gap-2">
                              <div class="flex-1 min-w-0">
                                <AmountInput
                                  tokenAddress={r.token}
                                  value={r.input}
                                  showHeader={false}
                                  showBalance={false}
                                  disabled={!!savingAddr()}
                                  onChange={({ text, amountWei }) => {
                                    setRows(i(), {
                                      input: text,
                                      wei: amountWei ?? 0n,
                                      invalid: amountWei == null,
                                    });
                                  }}
                                />
                              </div>
                              <div class="pt-2 w-5 flex-shrink-0">
                                <Show when={isSaving()}>
                                  <Spinner size="xs" />
                                </Show>
                                <Show when={!isSaving() && dirty()}>
                                  <span class="text-xs opacity-60">●</span>
                                </Show>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    }}
                  </For>
                </tbody>
              </table>
            </div>
            <p class="text-xs opacity-70">{t("npo.limits.hint")}</p>
          </Show>
        </Show>
      </div>
    </Modal>
  );
}
