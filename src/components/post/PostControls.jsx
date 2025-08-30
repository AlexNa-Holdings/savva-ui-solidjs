// src/components/post/PostControls.jsx
import { createSignal, Show, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { navigate } from "../../routing/hashRouter.js";
import { preparePostForEditing } from "../../editor/postImporter.js";
import { pushErrorToast } from "../../ui/toast.js";
import PostInfo from "../feed/PostInfo.jsx";
import Spinner from "../ui/Spinner.jsx";

function EditIcon(props) {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class={props.class || "w-5 h-5"} fill="currentColor">
      <path d="M20.71,3.29a2.91,2.91,0,0,0-2.2-.84,3.25,3.25,0,0,0-2.17,1L9.46,10.29s0,0,0,0a.62.62,0,0,0-.11.17,1,1,0,0,0-.1.18l0,0,L8,14.72A1,1,0,0,0,9,16a.9.9,0,0,0,.28,0l4-1.17,0,0,.18-.1a.62.62,0,0,0,.17-.11l0,0,6.87-6.88a3.25,3.25,0,0,0,1-2.17A2.91,2.91,0,0,0,20.71,3.29Z"></path>
      <path d="M20,22H4a2,2,0,0,1-2-2V4A2,2,0,0,1,4,2h8a1,1,0,0,1,0,2H4V20H20V12a1,1,0,0,1,2,0v8A2,2,0,0,1,20,22Z"></path>
    </svg>
  );
}

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
      <div class="flex-1 min-w-0">
        <PostInfo 
          item={props.post} 
          hideTopBorder={true} 
          timeFormat="long" 
        />
      </div>

      <div class="pl-4">
        <Show when={isAuthor()}>
          <div class="flex items-center gap-4 flex-shrink-0">
            <button
              onClick={handleEdit}
              disabled={isPreparing()}
              class="p-2 rounded text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] disabled:opacity-60"
              title="Edit Post"
            >
              <Show when={isPreparing()} fallback={<EditIcon class="w-5 h-5" />}>
                <Spinner class="w-5 h-5" />
              </Show>
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