// src/x/profile/SubscribersTab.jsx
import { createSignal, createMemo, For, Show, createEffect, on, onMount, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import UserCard from "../ui/UserCard.jsx";
import Spinner from "../ui/Spinner.jsx";
import TokenValue from "../ui/TokenValue.jsx";

async function fetchSponsors(params) {
  const { app, user_addr, n_weeks, offset, limit } = params;
  if (!app.wsMethod || !user_addr) return { sponsors: [], next_offset: null };
  try {
    const getSponsors = app.wsMethod("get-sponsors");
    const res = await getSponsors({
      domain: "", // Empty domain to get sponsors across all domains
      user_addr,
      n_weeks,
      limit,
      offset,
    });
    return {
      sponsors: Array.isArray(res?.sponsors) ? res.sponsors : [],
      next_offset: res?.next_offset ?? null,
    };
  } catch (e) {
    console.error("Failed to fetch sponsors:", e);
    return { sponsors: [], next_offset: null };
  }
}

export default function SubscribersTab(props) {
  const app = useApp();
  const { t } = app;
  const user = () => props.user;

  const [showActiveOnly, setShowActiveOnly] = createSignal(true);
  const nWeeks = createMemo(() => showActiveOnly() ? 1 : 0);
  
  const [sponsors, setSponsors] = createSignal([]);
  const [offset, setOffset] = createSignal(0);
  const [hasMore, setHasMore] = createSignal(true);
  const [loading, setLoading] = createSignal(false);

  const loadMore = async () => {
    if (loading() || !hasMore()) return;
    setLoading(true);
    
    const result = await fetchSponsors({ 
      app, 
      user_addr: user().address, 
      n_weeks: nWeeks(), 
      offset: offset(), 
      limit: 20 
    });
    
    if (result.sponsors.length > 0) {
      setSponsors(prev => [...prev, ...result.sponsors]);
    }
    
    if (result.next_offset) {
      setOffset(result.next_offset);
    } else {
      setHasMore(false);
    }

    setLoading(false);
  };
  
  createEffect(on(nWeeks, () => {
    setSponsors([]);
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
     <div class="px-2 space-y-6 mx-auto max-w-3xl">
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
            <For each={sponsors()}>
              {(sponsor) => (
                <tr class="border-b border-[hsl(var(--border))]">
                  <td class="px-4 py-2 font-medium">
                    <UserCard author={sponsor.user} />
                  </td>
                  <td class="px-4 py-2">{sponsor.domain}</td>
                  <td class="px-4 py-2 text-center">
                    {sponsor.weeks < 1 ? t("profile.subscribers.table.expired") : sponsor.weeks}
                  </td>
                  <td class="px-4 py-2 flex justify-end">
                    <TokenValue amount={sponsor.amount} format="vertical" />
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={loading()}>
          <div class="flex justify-center p-4"><Spinner /></div>
        </Show>
        <Show when={!loading() && sponsors().length === 0}>
          <p class="text-center text-sm text-[hsl(var(--muted-foreground))] py-8">
            {t("profile.subscribers.noResults")}
          </p>
        </Show>
      </div>
    </div>
  );
}

