// src/components/post/PostControls.jsx
import { createSignal, Show, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { navigate } from "../../routing/hashRouter.js";
import { preparePostForEditing } from "../../editor/postImporter.js";
import { pushErrorToast } from "../../ui/toast.js";
import PostInfo from "../feed/PostInfo.jsx";
import Spinner from "../ui/Spinner.jsx";
import ConfirmModal from "../ui/ConfirmModal.jsx";
import { EditIcon, TrashIcon } from "../ui/icons/ActionIcons.jsx";
import { useDeleteAction } from "../../hooks/useDeleteAction.js";

export default function PostControls(props) {
  const app = useApp();
  const { t } = app;
  const [isPreparing, setIsPreparing] = createSignal(false);
  
  const { showConfirm, openConfirm, closeConfirm, confirmDelete, modalProps } = useDeleteAction(() => props.post);

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
    <>
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
            <div class="flex items-center gap-2 flex-shrink-0">
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
              <button
                onClick={openConfirm}
                disabled={modalProps().isDeleting}
                class="p-2 rounded text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive-foreground))] disabled:opacity-60"
                title="Delete Post"
              >
                <TrashIcon class="w-5 h-5" />
              </button>
              <button class="px-4 py-2 text-sm rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]" disabled>
                Promote
              </button>
            </div>
          </Show>
        </div>
      </div>
      
      <ConfirmModal
        isOpen={showConfirm()}
        onClose={closeConfirm}
        onConfirm={confirmDelete}
        {...modalProps()}
      />
    </>
  );
}