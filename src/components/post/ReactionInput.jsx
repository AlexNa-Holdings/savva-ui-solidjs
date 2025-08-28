// src/components/post/ReactionInput.jsx
import { createMemo, Show, createSignal } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import ReactionIcon, { REACTION_TYPES } from "../ui/icons/ReactionIcon.jsx";
import { pushErrorToast } from "../../ui/toast.js";
import { dbg } from "../../utils/debug.js";

export default function ReactionInput(props) {
  const app = useApp();
  const { t, wsCall } = app;
  const [isProcessing, setIsProcessing] = createSignal(false);

  const myReactionIndex = createMemo(() => {
    // Handle both wrapped objects (from feeds) and raw objects (from PostPage)
    return props.post?._raw?.my_reaction ?? props.post?.my_reaction ?? -1;
  });

  const hasReacted = createMemo(() => myReactionIndex() >= 0);

  const reactionType = createMemo(() => {
    const index = myReactionIndex();
    return index >= 0 ? REACTION_TYPES[index] : 'like';
  });

  const reactionLabel = createMemo(() => t(`reactions.${reactionType()}`));

  const handleReaction = async () => {
    if (isProcessing()) return;
    setIsProcessing(true);
    
    const currentReaction = myReactionIndex();
    // If ANY reaction is set (>= 0), unset it (-1). Otherwise, set "like" (0).
    const newReaction = currentReaction >= 0 ? -1 : 0;

    try {
      await wsCall('react', {
        domain: app.selectedDomainName(),
        'obj-type': 0,
        'obj-id': props.post?.savva_cid,
        n: 0,
        reaction: newReaction,
      });
    } catch (e) {
      pushErrorToast(e, { context: "Failed to submit reaction" });
      dbg.error("ReactionInput", "Failed to send reaction", e);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <button
      onClick={handleReaction}
      disabled={isProcessing()}
      class="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold hover:bg-[hsl(var(--accent))] disabled:opacity-50"
      classList={{
        "text-[hsl(var(--muted-foreground))]": !hasReacted(),
        "text-blue-500": hasReacted()
      }}
    >
      <Show
        when={hasReacted()}
        fallback={<span class="filter grayscale">👍</span>}
      >
        <ReactionIcon type={reactionType()} class="text-lg" />
      </Show>
      <span>{reactionLabel()}</span>
    </button>
  );
}