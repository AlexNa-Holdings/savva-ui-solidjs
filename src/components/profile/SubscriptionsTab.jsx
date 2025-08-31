// src/components/profile/SubscriptionsTab.jsx
import { createSignal, createMemo, For, Show, createEffect, on, onMount, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import UserCard from "../ui/UserCard.jsx";
import Spinner from "../ui/Spinner.jsx";
import TokenValue from "../ui/TokenValue.jsx";

async function fetchSponsees(params) {
  const { app, user_addr, n_weeks, offset, limit } = params;
  if (!app.wsMethod || !user_addr) return { sponsees: [], next_offset: null };
  try {
    const getSponsees = app.wsMethod("get-sponsees");
    const res = await getSponsees({
      domain: "", // Empty domain to get sponsees across all domains
      user_addr,
      n_weeks,
      limit,
      offset,
    });
    return {
      sponsees: Array.isArray(res?.sponsees) ? res.sponsees : [],
      next_offset: res?.next_offset ?? null,
    };
  } catch (e) {
    console.error("Failed to fetch sponsees:", e);
    return { sponsees: [], next_offset: null };
  }
}

export default function SubscriptionsTab(props) {
  const app = useApp();
  const { t } = app;
  const user = () => props.user;

  const [showActiveOnly, setShowActiveOnly] = createSignal(true);
  const nWeeks = createMemo(() => showActiveOnly() ? 1 : 0);
  
  const [sponsees, setSponsees] = createSignal([]);
  const [offset, setOffset] = createSignal(0);
  const [hasMore, setHasMore] = createSignal(true);
  const [loading, setLoading] = createSignal(false);

  const loadMore = async () => {
    if (loading() || !hasMore()) return;
    setLoading(true);
    
    const result = await fetchSponsees({ 
      app, 
      user_addr: user().address, 
      n_weeks: nWeeks(), 
      offset: offset(), 
      limit: 20 
    });
    
    if (result.sponsees.length > 0) {
      setSponsees(prev => [...prev, ...result.sponsees]);
    }
    
    if (result.next_offset) {
      setOffset(result.next_offset);
    } else {
      setHasMore(false);
    }

    setLoading(false);
  };
  
  createEffect(on(nWeeks, () => {
    setSponsees([]);
    setOffset(0);
    setHasMore(true);
    loadMore();
  }));
  
  onMount(() => {
    loadMore(); // Initial load
    const handleScroll = () => {
      const scrollThreshold = 300;
      const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - scrollThreshold;
      if (nearBottom) {
        loadMore();
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    onCleanup(() => window.removeEventListener('scroll', handleScroll));
  });

  return (
    <div class="px-2">
      <div class="flex items-center justify-end mb-4">
        <label class="flex items-center gap-2 text-sm cursor-pointer">
          <input 
            type="checkbox" 
            class="rounded"
            checked={showActiveOnly()} 
            onChange={e => setShowActiveOnly(e.currentTarget.checked)} 
          />
          {t("profile.subscribers.showActiveOnly")}
        </label>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">
          <thead class="text-xs text-[hsl(var(--muted-foreground))] uppercase bg-[hsl(var(--muted))]">
            <tr>
              <th scope="col" class="px-4 py-2">{t("profile.subscribers.table.user")}</th>
              <th scope="col" class="px-4 py-2">{t("profile.subscribers.table.domain")}</th>
              <th scope="col" class="px-4 py-2 text-center">{t("profile.subscribers.table.weeks")}</th>
              <th scope="col" class="px-4 py-2 text-right">{t("profile.subscribers.table.amount")}</th>
            </tr>
          </thead>
          <tbody>
            <For each={sponsees()}>
              {(sponsee) => (
                <tr class="border-b border-[hsl(var(--border))]">
                  <td class="px-4 py-2 font-medium">
                    <UserCard author={sponsee.user} />
                  </td>
                  <td class="px-4 py-2">{sponsee.domain}</td>
                  <td class="px-4 py-2 text-center">
                    {sponsee.weeks < 1 ? t("profile.subscribers.table.expired") : sponsee.weeks}
                  </td>
                  <td class="px-4 py-2 flex justify-end">
                    <TokenValue amount={sponsee.amount} format="vertical" />
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={loading()}>
          <div class="flex justify-center p-4"><Spinner /></div>
        </Show>
        <Show when={!loading() && sponsees().length === 0}>
          <p class="text-center text-sm text-[hsl(var(--muted-foreground))] py-8">
            {t("profile.subscribers.noResults")}
          </p>
        </Show>
      </div>
    </div>
  );
}