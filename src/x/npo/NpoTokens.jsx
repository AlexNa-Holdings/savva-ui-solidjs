// src/x/npo/NpoTokens.jsx
import { For, Show, createEffect, createMemo, createResource, createSignal } from "solid-js";
import { Dynamic } from "solid-js/web";
import { useApp } from "../../context/AppContext.jsx";
import { createPublicClient, getContract } from "viem";
import { configuredHttp } from "../../blockchain/contracts.js";
import SavvaNPOAbi from "../../blockchain/abi/SavvaNPO.json";
import { sendAsUser } from "../../blockchain/npoMulticall.js";
import { getTokenInfo } from "../../blockchain/tokenMeta.jsx";
import Spinner from "../ui/Spinner.jsx";
import ConfirmModal from "../modals/ConfirmModal.jsx";
import AddSupportedTokenModal from "../modals/AddSupportedTokenModal.jsx";
import { pushToast, pushErrorToast } from "../../ui/toast.js";

const truncateAddr = (a) => {
  const s = String(a || "");
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
};

function TokenRow(props) {
  const app = useApp();
  const [meta] = createResource(
    () => props.address,
    (addr) => getTokenInfo(app, addr)
  );
  return (
    <tr class="border-b border-[hsl(var(--border))]">
      <td class="px-3 py-2">
        <div class="flex items-center gap-2 min-w-0">
          <Show when={meta()?.Icon} fallback={<span class="inline-block w-5 h-5" />}>
            <Dynamic component={meta().Icon} class="w-5 h-5 flex-shrink-0" />
          </Show>
          <span class="font-medium truncate">{meta()?.symbol || "…"}</span>
        </div>
      </td>
      <td class="px-3 py-2">
        <Show when={meta()} fallback={<span class="opacity-60">…</span>}>
          {meta().decimals}
        </Show>
      </td>
      <td class="px-3 py-2 font-mono text-xs">
        <a
          class="hover:underline"
          href={`#/profile/${props.address}`}
          title={props.address}
        >
          {truncateAddr(props.address)}
        </a>
      </td>
      <td class="px-3 py-2">
        <Show when={props.isAdmin}>
          <button
            class="px-2 py-1 rounded border border-[hsl(var(--destructive))] text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive-foreground))] disabled:opacity-50"
            disabled={props.busy}
            onClick={() => props.onRemove(props.address)}
          >
            <Show when={!props.busy} fallback={<Spinner size="xs" />}>
              {props.removeLabel}
            </Show>
          </button>
        </Show>
      </td>
    </tr>
  );
}

export default function NpoTokens(props) {
  const app = useApp();
  const { t } = app;

  const npoAddr = () => props.npoAddr;
  const isAdmin = () => !!props.selfIsAdmin;

  const [loading, setLoading] = createSignal(false);
  const [tokens, setTokens] = createSignal([]); // [string]
  const [removingSet, setRemovingSet] = createSignal(new Set());
  const [showAdd, setShowAdd] = createSignal(false);
  const [confirmRemove, setConfirmRemove] = createSignal({ open: false, address: "" });

  const setRemoving = (addr, on) =>
    setRemovingSet((prev) => {
      const next = new Set(prev);
      const k = String(addr || "").toLowerCase();
      if (on) next.add(k); else next.delete(k);
      return next;
    });
  const isRemoving = (addr) => removingSet().has(String(addr || "").toLowerCase());

  async function load() {
    if (!npoAddr()) return;
    setLoading(true);
    try {
      const chain = app.desiredChain?.();
      const pc = createPublicClient({ chain, transport: configuredHttp(chain?.rpcUrls?.[0] ?? "") });
      const c = getContract({ address: npoAddr(), abi: SavvaNPOAbi, client: pc });
      const list = await c.read.getSupportedTokens();
      setTokens([...(list || [])]);
    } catch {
      setTokens([]);
    } finally {
      setLoading(false);
    }
  }
  createEffect(load);

  async function removeToken(tokenAddr) {
    if (!npoAddr() || !tokenAddr) return;
    try {
      setRemoving(tokenAddr, true);
      await sendAsUser(app, {
        target: npoAddr(),
        abi: SavvaNPOAbi,
        functionName: "removeSupportedToken",
        args: [tokenAddr],
      });
      pushToast({ type: "success", message: t("npo.tokens.removed") });
      await load();
    } catch (e) {
      pushErrorToast({ message: e?.message || t("errors.updateFailed") });
    } finally {
      setRemoving(tokenAddr, false);
    }
  }

  const empty = createMemo(() => !loading() && tokens().length === 0);

  return (
    <div class="p-3">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-lg font-semibold">{t("npo.tokens.title")}</h3>
        <Show when={isAdmin()}>
          <button
            class="px-3 py-1.5 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
            onClick={() => setShowAdd(true)}
          >
            {t("npo.tokens.add")}
          </button>
        </Show>
      </div>

      <Show when={!loading()} fallback={<div class="py-8 flex justify-center"><Spinner /></div>}>
        <Show when={!empty()} fallback={<div class="p-4 opacity-70">{t("npo.tokens.empty")}</div>}>
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="text-left border-b border-[hsl(var(--border))]">
                  <th class="px-3 py-2">{t("npo.tokens.col.token")}</th>
                  <th class="px-3 py-2">{t("npo.tokens.col.decimals")}</th>
                  <th class="px-3 py-2">{t("npo.tokens.col.address")}</th>
                  <th class="px-3 py-2 w-[160px]">{t("npo.tokens.col.actions")}</th>
                </tr>
              </thead>
              <tbody>
                <For each={tokens()}>
                  {(addr) => (
                    <TokenRow
                      address={addr}
                      isAdmin={isAdmin()}
                      busy={isRemoving(addr)}
                      removeLabel={t("npo.tokens.remove")}
                      onRemove={(a) => setConfirmRemove({ open: true, address: a })}
                    />
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>

      <AddSupportedTokenModal
        isOpen={showAdd()}
        onClose={() => setShowAdd(false)}
        npoAddr={npoAddr()}
        existing={tokens()}
        onAdded={async () => { setShowAdd(false); await load(); }}
      />

      <ConfirmModal
        isOpen={confirmRemove().open}
        onClose={() => setConfirmRemove({ open: false, address: "" })}
        onConfirm={() => removeToken(confirmRemove().address)}
        title={t("npo.tokens.confirmRemove.title")}
        message={t("npo.tokens.confirmRemove.message", { address: truncateAddr(confirmRemove().address) })}
      />
    </div>
  );
}
