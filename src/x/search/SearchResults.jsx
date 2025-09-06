// src/x/search/SearchResults.jsx
import { Show, For, onMount } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import UserCard from "../ui/UserCard.jsx";
import ContentCard from "../post/ContentCard.jsx";

export default function SearchResults(props) {
  const { t } = useApp();
  let scroller;

  function onScroll() {
    if (!scroller) return;
    const nearBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 80;
    if (nearBottom) {
      if (props.hasMorePosts && !props.loadingPosts) props.loadMorePosts?.();
      if (props.hasMoreUsers && !props.loadingUsers) props.loadMoreUsers?.();
    }
  }

  onMount(() => {
    scroller?.addEventListener("scroll", onScroll, { passive: true });
  });

  return (
    <div
      ref={scroller}
      class="max-h-[70vh] overflow-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] divide-y divide-[hsl(var(--border))]"
    >
      {/* Users */}
      <div class="p-3">
        <div class="text-xs uppercase tracking-wide mb-2 text-[hsl(var(--muted-foreground))]">
          {t("search.users")}
        </div>
        <Show
          when={props.query?.length > 0}
          fallback={<div class="text-sm text-[hsl(var(--muted-foreground))]">{t("search.typeToSearch")}</div>}
        >
          <Show
            when={props.users?.length}
            fallback={
              <Show when={!props.loadingUsers}>
                <div class="text-sm text-[hsl(var(--muted-foreground))]">{t("search.noResults")}</div>
              </Show>
            }
          >
            <div class="space-y-2">
              <For each={props.users}>
                {(u) => (
                  <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
                    {/* UserCard generally expects an author-like object; pass-through u */}
                    <UserCard author={u} />
                  </div>
                )}
              </For>
            </div>
          </Show>
          <Show when={props.loadingUsers}>
            <div class="mt-2 text-sm">{t("search.loading")}</div>
          </Show>
        </Show>
      </div>

      {/* Posts / content */}
      <div class="p-3">
        <div class="text-xs uppercase tracking-wide mb-2 text-[hsl(var(--muted-foreground))]">
          {t("search.posts")}
        </div>
        <Show
          when={props.query?.length >= 3}
          fallback={<div class="text-sm text-[hsl(var(--muted-foreground))]">{t("search.minChars", { n: 3 })}</div>}
        >
          <Show
            when={props.posts?.length}
            fallback={
              <Show when={!props.loadingPosts}>
                <div class="text-sm text-[hsl(var(--muted-foreground))]">{t("search.noResults")}</div>
              </Show>
            }
          >
            <div class="space-y-2">
              <For each={props.posts}>
                {(p) => (
                  <div
                    class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--accent))] transition cursor-pointer"
                    onClick={() => props.onOpenPost?.(p)}
                  >
                    {/* ContentCard decides Post vs Comment internally */}
                    <ContentCard postInfo={p} />
                  </div>
                )}
              </For>
            </div>
          </Show>
          <Show when={props.loadingPosts}>
            <div class="mt-2 text-sm">{t("search.loading")}</div>
          </Show>
        </Show>
      </div>
    </div>
  );
}
