// src/components/editor/PostComments.jsx
import { createResource, For, Show, createSignal, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext";
import { toChecksumAddress } from "../../blockchain/utils";
import Spinner from "../ui/Spinner";
import CommentCard from "./CommentCard";
import { navigate } from "../../routing/hashRouter.js";

async function fetchComments(params) {
  const { app, postId, offset = 0 } = params;
  if (!app.wsMethod || !postId) return { list: [], nextOffset: null };

  const getChildren = app.wsMethod("content-children");
  const requestParams = {
    domain: app.selectedDomainName(),
    savva_cid: postId,
    max_deep: 4,
    limit: 20,
    offset,
  };

  const user = app.authorizedUser();
  if (user?.address) {
    requestParams.my_addr = toChecksumAddress(user.address);
  }

  try {
    const res = await getChildren(requestParams);
    const list = Array.isArray(res?.list) ? res.list : [];
    const nextOffset = res?.next_offset > 0 ? res.next_offset : null;
    return { list, nextOffset };
  } catch (err) {
    console.error(`Failed to fetch comments for post '${postId}':`, err);
    return { list: [], nextOffset: null, error: err.message };
  }
}

export default function PostComments(props) {
  const app = useApp();
  const { t } = app;
  const postId = () => props.post?.savva_cid;

  const [comments, setComments] = createSignal([]);
  const [nextOffset, setNextOffset] = createSignal(0);
  const [isLoadingMore, setIsLoadingMore] = createSignal(false);

  const [initialData] = createResource(() => ({ app, postId: postId() }), fetchComments);

  createEffect(() => {
    const data = initialData();
    if (data && !initialData.loading) {
      setComments(data.list || []);
      setNextOffset(data.nextOffset);
    }
  });

  const loadMore = async () => {
    if (isLoadingMore() || nextOffset() === null) return;
    setIsLoadingMore(true);
    const data = await fetchComments({ app, postId: postId(), offset: nextOffset() });
    if (data.list) {
      setComments((prev) => [...prev, ...data.list]);
      setNextOffset(data.nextOffset);
    }
    setIsLoadingMore(false);
  };

  const handleAddComment = () => {
    navigate(`/editor/new-comment/${postId()}`);
  };

  return (
    <div class="mt-8 pt-6 border-t border-[hsl(var(--border))]">
      {/* Header with link only, no counter */}
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-xl font-semibold">{t("post.comments")}</h3>
        <button
          onClick={handleAddComment}
          class="text-sm underline text-[hsl(var(--foreground))] hover:opacity-80"
        >
          {t("post.addComment")}
        </button>
      </div>

      <Show when={initialData.loading}>
        <div class="flex justify-center p-8"><Spinner /></div>
      </Show>

      <Show when={initialData.error}>
        <p class="text-sm text-[hsl(var(--destructive))]">
          {t("common.error")}: {initialData.error}
        </p>
      </Show>

      <Show when={!initialData.loading && !initialData.error && comments().length > 0}>
        <div class="space-y-4">
          <For each={comments()}>
            {(comment) => <CommentCard comment={comment} />}
          </For>
        </div>
      </Show>

      <Show when={!initialData.loading && !initialData.error && comments().length === 0}>
        <p class="text-sm text-[hsl(var(--muted-foreground))]">{t("post.noComments")}</p>
      </Show>

      <Show when={nextOffset() !== null && !initialData.loading}>
        <div class="mt-6 text-center">
          <button
            onClick={loadMore}
            disabled={isLoadingMore()}
            class="px-4 py-2 rounded-md border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--accent))] disabled:opacity-50"
          >
            {isLoadingMore() ? t("common.loading") : t("post.loadMoreComments")}
          </button>
        </div>
      </Show>
    </div>
  );
}