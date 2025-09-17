// src/x/feed/ContentFeed.jsx
import { createSignal, onCleanup, onMount, Show, createEffect, on, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import PostListView from "./PostListView.jsx";
import { dbg } from "../../utils/debug.js";
import useUserProfile, { selectField } from "../profile/userProfileStore.js";

export default function ContentFeed(props) {
  const { t, authorizedUser } = useApp();
  const { dataStable: profile } = useUserProfile();

  const [items, setItems] = createSignal([]);
  const [page, setPage] = createSignal(0);
  const [hasMore, setHasMore] = createSignal(true);
  const [loading, setLoading] = createSignal(false);
  const [hasLoadedOnce, setHasLoadedOnce] = createSignal(false);

  // Accept either prop name; default to true if not provided.
  const isActive = () => (props.isActivated ?? props.isActive ?? true);

  const authed = () => !!authorizedUser?.();

  /**
   * Tri-state handling for profile:
   * - undefined  → not resolved yet (still loading)
   * - null       → resolved and NO profile for this user (valid state)
   * - object     → resolved and HAS profile
   *
   * We consider the feed "ready" as soon as the profile store is RESOLVED,
   * even if it's a null (no-profile) result.
   */
  const profVal = () => profile?.(); // may be undefined | null | object
  const profileResolved = () => profVal() !== undefined; // undefined means "still loading"
  const ready = () => !authed() || profileResolved();

  // Safe NSFW preference (used by fetchPage impls)
  const nsfwPref = createMemo(() => {
    const p = profVal();
    const u = authorizedUser?.();
    // Try profile first, then user's own flag (if present), then default 'h'
    return (selectField?.(p, "nsfw") ??
      selectField?.(p, "prefs.nsfw") ??
      u?.nsfw ??
      "h");
  });

  // ---------- DEBUG SNAPSHOTS ----------
  createEffect(() => {
    dbg.log("ContentFeed:gates", {
      isActive: isActive(),
      authed: authed(),
      profileValType: typeof profVal(),
      profileResolved: profileResolved(),
      ready: ready(),
      hasLoadedOnce: hasLoadedOnce(),
      loading: loading(),
      hasMore: hasMore(),
      page: page(),
      pageSize: props.pageSize,
      hasFetchPage: !!props.fetchPage,
      nsfwPref: nsfwPref(),
      resetOnType: typeof props.resetOn,
    });
  });

  createEffect(() => {
    const v = profVal();
    dbg.log("ContentFeed:profile change", v === undefined ? "undefined (loading)" : v === null ? "null (no profile)" : "object");
  });
  // ------------------------------------

  async function loadMore() {
    dbg.log("ContentFeed", "loadMore() entered");
    const notReady = !ready();
    const isLoading = loading();
    const noMore = !hasMore();

    if (notReady || isLoading || noMore) {
      dbg.log("ContentFeed", "loadMore: bail", {
        notReady,
        isLoading,
        noMore,
        ready: ready(),
        loading: loading(),
        hasMore: hasMore(),
      });
      return;
    }

    setLoading(true);
    try {
      const nextPage = page() + 1;
      const size = props.pageSize || 12;
      dbg.log("ContentFeed", "→ fetching page", nextPage, "size", size, "nsfwPref", nsfwPref());

      if (!props.fetchPage) {
        dbg.log("ContentFeed", "⚠ fetchPage prop is missing");
      }

      // Pass nsfwPref through if your fetchPage accepts it (3rd arg). Safe no-op otherwise.
      const chunk = (await props.fetchPage?.(nextPage, size, nsfwPref())) ?? [];
      dbg.log("ContentFeed", "page result length", chunk.length);

      if (!chunk.length) setHasMore(false);

      setItems((prev) => {
        const next = prev.concat(chunk);
        props.onItemsChange?.(next);
        return next;
      });

      setPage(nextPage);
    } catch (e) {
      dbg.log("ContentFeed", "loadMore error", e);
    } finally {
      setLoading(false);
      setHasLoadedOnce(true); // mark only after a real attempt
      dbg.log("ContentFeed", "loadMore() finished", {
        loading: loading(),
        hasLoadedOnce: hasLoadedOnce(),
        page: page(),
        hasMore: hasMore(),
      });
    }
  }

  // Initial load: only when active + ready + not yet loaded.
  createEffect(() => {
    const cond = isActive() && ready() && !hasLoadedOnce();
    dbg.log("ContentFeed:init effect", {
      isActive: isActive(),
      ready: ready(),
      hasLoadedOnce: hasLoadedOnce(),
      willSchedule: cond,
    });
    if (cond) {
      dbg.log("ContentFeed", "Activated & ready & !hasLoadedOnce → scheduling loadMore");
      queueMicrotask(loadMore);
    }
  });

  onCleanup(() => dbg.log("ContentFeed", "unmounted"));

  onMount(() => {
    dbg.log("ContentFeed", "onMount");

    const handleScroll = () => {
      if (!isActive() || !ready()) {
        dbg.log("ContentFeed:scroll", "bail (inactive or not ready)", {
          isActive: isActive(),
          ready: ready(),
        });
        return;
      }
      const scrollThreshold = 600;
      const scrolledToBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - scrollThreshold;

      dbg.log("ContentFeed:scroll", {
        innerHeight: window.innerHeight,
        scrollY: window.scrollY,
        scrollHeight: document.documentElement.scrollHeight,
        threshold: scrollThreshold,
        scrolledToBottom,
      });

      if (scrolledToBottom) {
        dbg.log("ContentFeed:scroll", "→ bottom reached, calling loadMore()");
        loadMore();
      }
    };

    let timeoutId = null;
    const throttledHandleScroll = () => {
      if (timeoutId === null) {
        timeoutId = setTimeout(() => {
          handleScroll();
          timeoutId = null;
        }, 200);
      }
    };

    window.addEventListener("scroll", throttledHandleScroll, { passive: true });
    dbg.log("ContentFeed", "scroll listener attached");

    onCleanup(() => {
      window.removeEventListener("scroll", throttledHandleScroll);
      if (timeoutId) clearTimeout(timeoutId);
      dbg.log("ContentFeed", "cleanup: scroll listener removed");
    });
  });

  // Reset pagination on external key changes (domain/category/etc.)
  createEffect(
    on(
      () => props.resetOn,
      (val) => {
        dbg.log("ContentFeed:resetOn", { val });

        setItems([]);
        props.onItemsChange?.([]);
        setPage(0);
        setHasMore(true);
        setLoading(false);
        setHasLoadedOnce(false);

        if (isActive() && ready()) {
          dbg.log("ContentFeed:resetOn", "→ active & ready, scheduling loadMore");
          queueMicrotask(loadMore);
        } else {
          dbg.log("ContentFeed:resetOn", "→ not ready/active yet, will wait");
        }
      },
      { defer: true }
    )
  );

  return (
    <div class="w-full">
      <PostListView items={items()} mode={props.mode} isRailVisible={props.isRailVisible} />
      <Show when={loading()}>
        <div class="py-4 text-sm text-[hsl(var(--muted-foreground))] text-center">
          {t("common.loading")}
        </div>
      </Show>
    </div>
  );
}
