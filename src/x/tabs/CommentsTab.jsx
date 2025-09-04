// src/x/tabs/CommentsTab.jsx
import { createSignal, onCleanup, onMount, For, Show, createEffect, on } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { dbg } from "../../utils/debug.js";
import { toChecksumAddress } from "../../blockchain/utils.js";
import CommentThread from "../comments/CommentThread.jsx";

export default function CommentsTab(props) {
  const { t } = useApp();
  const app = useApp();
  const [items, setItems] = createSignal([]);
  const [page, setPage] = createSignal(0);
  const [hasMore, setHasMore] = createSignal(true);
  const [loading, setLoading] = createSignal(false);
  const [hasLoadedOnce, setHasLoadedOnce] = createSignal(false);

  const commentListFetcher = app.wsMethod ? app.wsMethod("latest-comments-new") : null;

  async function loadMore() {
    if (loading() || !hasMore()) return;
    setLoading(true);

    try {
      const nextPage = page() + 1;
      const pageSize = 10;

      const params = {
        domain: app.selectedDomainName(),
        limit: pageSize,
        offset: (nextPage - 1) * pageSize,
      };

      const user = app.authorizedUser();
      if (user?.address) {
        params.my_addr = toChecksumAddress(user.address);
      }

      if (!commentListFetcher) throw new Error("API method not available.");

      const res = await commentListFetcher(params);
      const chunk = res?.list || [];

      if (chunk.length < pageSize) setHasMore(false);

      const newItems = chunk.map(it => ({ id: it.savva_cid, _raw: it }));
      setItems(prev => [...prev, ...newItems]);
      setPage(nextPage);

    } catch (e) {
      dbg.error("CommentsTab", "Failed to fetch comments", e);
    } finally {
      setLoading(false);
    }
  }

  createEffect(() => {
    if (props.isActivated && !hasLoadedOnce()) {
      setHasLoadedOnce(true);
      loadMore();
    }
  });

  onMount(() => {
    const handleScroll = () => {
      if (!props.isActivated) return;
      const scrollThreshold = 400;
      const scrolledToBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - scrollThreshold;
      if (scrolledToBottom) loadMore();
    };

    let timeoutId = null;
    const throttledHandleScroll = () => {
      if (timeoutId === null) {
        timeoutId = setTimeout(() => { handleScroll(); timeoutId = null; }, 200);
      }
    };
    window.addEventListener('scroll', throttledHandleScroll, { passive: true });

    onCleanup(() => {
      window.removeEventListener('scroll', throttledHandleScroll);
      if (timeoutId) clearTimeout(timeoutId);
    });
  });

  return (
    <section class="w-full space-y-4">
      <For each={items()}>
        {(item) => <CommentThread thread={item} />}
      </For>
      <Show when={loading()}>
        <div class="py-4 text-sm text-[hsl(var(--muted-foreground))] text-center">{t("common.loading")}</div>
      </Show>
    </section>
  );
}