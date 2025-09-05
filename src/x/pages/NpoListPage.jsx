// src/x/pages/NpoListPage.jsx
import { For, Show, createSignal, createMemo, onMount } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import ClosePageButton from "../ui/ClosePageButton.jsx";
import Spinner from "../ui/Spinner.jsx";
import UserCard from "../ui/UserCard.jsx";
import { navigate } from "../../routing/hashRouter.js";
import { ArrowRightIcon } from "../ui/icons/ArrowIcons.jsx";
import { pushToast, pushErrorToast } from "../../ui/toast.js";
import SavvaNPOAbi from "../../blockchain/abi/SavvaNPO.json";
import { getContract } from "viem";
import { getSavvaContract } from "../../blockchain/contracts.js";

const DEFAULT_LIMIT = 20;

export default function NpoListPage() {
  const app = useApp();
  const { t } = app;

  const [items, setItems] = createSignal([]);
  const [loading, setLoading] = createSignal(false);
  const [offset, setOffset] = createSignal(0);
  const [hasMore, setHasMore] = createSignal(true);

  // defaults
  const [onlyMine, setOnlyMine] = createSignal(true);
  const [onlyConfirmed, setOnlyConfirmed] = createSignal(true);
  const [creating, setCreating] = createSignal(false);

  const effectiveUserAddr = createMemo(() => {
    if (!onlyMine()) return undefined;
    return app.authorizedUser?.()?.address;
  });

  async function fetchPage(reset = false) {
    if (!app.wsMethod) return;
    if (loading()) return;
    setLoading(true);

    try {
      const listNpo = app.wsMethod("list-npo");
      const params = {
        limit: DEFAULT_LIMIT,
        offset: reset ? 0 : offset(),
        confirmed_only: !!onlyConfirmed(),
      };
      if (effectiveUserAddr()) params.user_addr = effectiveUserAddr();

      const res = await listNpo(params);
      const list = Array.isArray(res) ? res : (res?.list || []);
      const merged = reset ? list : items().concat(list);
      setItems(merged);
      const nextOffset = (reset ? 0 : offset()) + list.length;
      setOffset(nextOffset);
      setHasMore(list.length === DEFAULT_LIMIT);
    } catch (e) {
      pushErrorToast({ message: e?.message || t("errors.loadFailed") });
    } finally {
      setLoading(false);
    }
  }

  onMount(() => fetchPage(true));

  const handleToggleMine = () => {
    setOnlyMine((v) => !v);
    setOffset(0);
    fetchPage(true);
  };

  const handleToggleConfirmed = () => {
    setOnlyConfirmed((v) => !v);
    setOffset(0);
    fetchPage(true);
  };

  async function writeNpo(npoAddr, fnName) {
    try {
      const client = await app.getGuardedWalletClient(); // ensures correct account/chain
      const contract = getContract({ address: npoAddr, abi: SavvaNPOAbi, client });
      await contract.write[fnName]([]);
      pushToast({ type: "success", message: t("common.saved") });
      const confirmed = fnName === "confirmMembership";
      setItems((arr) => arr.map((it) => (it.address === npoAddr ? { ...it, confirmed } : it)));
    } catch (err) {
      pushErrorToast({ message: err?.message || t("errors.updateFailed") });
    }
  }
  const confirm = (addr) => writeNpo(addr, "confirmMembership");
  const unconfirm = (addr) => writeNpo(addr, "unconfirmMembership");

  async function createNpo() {
    if (creating()) return;
    const admin = app.authorizedUser?.()?.address;
    if (!admin) {
      pushErrorToast({ message: t("errors.walletRequired") });
      return;
    }
    try {
      setCreating(true);
      // Get write-enabled factory instance using /info.savva_contracts map
      const factory = await getSavvaContract(app, "SavvaNPOFactory", { write: true }); // cloneSavvaNPO(first_admin)
      await factory.write.cloneSavvaNPO([admin]); // no args aside from first_admin
      pushToast({ type: "success", message: t("npo.list.createdTx") });

      // Refresh the list. Keep current filters; the new NPO may be pending confirmation.
      // If it doesn’t show under “only confirmed”, user can toggle that switch.
      await fetchPage(true);
    } catch (err) {
      pushErrorToast({ message: err?.message || t("errors.updateFailed") });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div class="mx-auto w-full max-w-[860px] px-3">
      <div class="flex items-center justify-between gap-3 mb-3">
        <h1 class="text-xl font-semibold">{t("npo.list.title")}</h1>
        <ClosePageButton />
      </div>

      <div class="flex flex-wrap items-center gap-3 mb-4">
        <label class="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyMine()}
            onInput={handleToggleMine}
            class="accent-[hsl(var(--primary))]"
            aria-label={t("npo.list.onlyMine")}
          />
          <span>{t("npo.list.onlyMine")}</span>
        </label>

        <label class="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyConfirmed()}
            onInput={handleToggleConfirmed}
            class="accent-[hsl(var(--primary))]"
            aria-label={t("npo.list.onlyConfirmed")}
          />
        <span>{t("npo.list.onlyConfirmed")}</span>
        </label>

        <div class="ml-auto">
          <button
            type="button"
            class="px-3 py-1.5 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
            onClick={createNpo}
            disabled={creating()}
            title={creating() ? t("npo.list.creating") : t("npo.list.create")}
          >
            {creating() ? t("npo.list.creating") : t("npo.list.create")}
          </button>
        </div>
      </div>

      <div class="rounded-lg border border-[hsl(var(--border))] overflow-x-auto bg-[hsl(var(--card))]">
        <table class="min-w-full text-sm">
          <colgroup>
            <col />
            <col class="w-[1%]" />
            <col class="w-[1%]" />
          </colgroup>
          <thead class="bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
            <tr>
              <th class="px-4 py-2 text-left">{t("npo.list.col.npo")}</th>
              <th class="px-4 py-2 text-left">{t("npo.list.col.actions")}</th>
              <th class="px-4 py-2 text-right">{t("npo.list.col.open")}</th>
            </tr>
          </thead>
          <tbody>
            <Show
              when={items().length}
              fallback={
                <tr>
                  <td colSpan="3" class="px-4 py-8 text-center text-[hsl(var(--muted-foreground))]">
                    {loading() ? t("common.loading") : t("npo.list.empty")}
                  </td>
                </tr>
              }
            >
              <For each={items()}>
                {(it) => (
                  <tr class="border-t border-[hsl(var(--border))]">
                    {/* NPO full card */}
                    <td class="px-4 py-3 align-top">
                      <UserCard author={it} />
                    </td>

                    {/* Actions only visible in "my NPOs" mode */}
                    <td class="px-4 py-3 align-top">
                      <Show when={onlyMine()}>
                        <div class="flex flex-wrap items-center gap-2">
                          <Show when={!it?.confirmed}>
                            <button
                              type="button"
                              class="px-3 py-1 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
                              onClick={() => confirm(it.address)}
                            >
                              {t("npo.list.actions.confirm")}
                            </button>
                          </Show>
                          <Show when={it?.confirmed}>
                            <button
                              type="button"
                              class="px-3 py-1 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]"
                              onClick={() => unconfirm(it.address)}
                            >
                              {t("npo.list.actions.unconfirm")}
                            </button>
                          </Show>
                        </div>
                      </Show>
                    </td>

                    {/* Open link */}
                    <td class="px-2 py-2 align-top">
                      <div class="flex items-center justify-end">
                        <button
                          class="p-1 rounded hover:bg-[hsl(var(--accent))]"
                          title={t("npo.list.open")}
                          onClick={() => navigate(`/npo/${it.address}`)}
                        >
                          <ArrowRightIcon class="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </Show>
          </tbody>
        </table>

        <Show when={loading()}>
          <div class="py-4 flex justify-center"><Spinner /></div>
        </Show>

        <Show when={!loading() && hasMore()}>
          <div class="flex justify-center py-4">
            <button
              class="px-4 py-2 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]"
              onClick={() => fetchPage(false)}
            >
              {t("common.loadMore")}
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
}
