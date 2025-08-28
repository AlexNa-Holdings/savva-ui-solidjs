// src/components/post/PostControls.jsx
import { createSignal, Show, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { navigate } from "../../routing/hashRouter.js";
import { preparePostForEditing } from "../../editor/postImporter.js";
import { pushErrorToast } from "../../ui/toast.js";
import ReactionInput from "./ReactionInput.jsx";

export default function PostControls(props) {
  const app = useApp();
  const { t } = app;
  const [isPreparing, setIsPreparing] = createSignal(false);

  const isAuthor = createMemo(() => {
    const userAddr = app.authorizedUser()?.address?.toLowerCase();
    const authorAddr = props.post?.author?.address?.toLowerCase();
    return !!userAddr && userAddr === authorAddr;
  });

  const handleEdit = async () => {
    setIsPreparing(true);
    try {
      await preparePostForEditing(props.post, app);
      navigate(`/editor/edit/${props.post.savva_cid}`);
    } catch (e) {
      pushErrorToast(e, { context: "Failed to prepare post for editing." });
    } finally {
      setIsPreparing(false);
    }
  };

  return (
    <div class="mt-8 pt-4 border-t border-[hsl(var(--border))] flex items-center justify-between">
      {/* Left Side: Reaction Input for any logged-in user */}
      <div>
        <Show when={app.authorizedUser()}>
          <ReactionInput post={props.post} />
        </Show>
      </div>

      {/* Right Side: Author-only buttons */}
      <div>
        <Show when={isAuthor()}>
          <div class="flex items-center gap-4">
            <button
              onClick={handleEdit}
              disabled={isPreparing()}
              class="px-4 py-2 text-sm rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
            >
              {isPreparing() ? t("common.loading") : "Edit Post"}
            </button>
            <button class="px-4 py-2 text-sm rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]" disabled>
              Promote
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
}