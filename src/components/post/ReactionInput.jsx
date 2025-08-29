// src/components/post/ReactionInput.jsx
import { createMemo, Show, createSignal, createEffect, For, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import ReactionIcon, { REACTION_TYPES } from "../ui/icons/ReactionIcon.jsx";
import { pushErrorToast } from "../../ui/toast.js";
import { dbg } from "../../utils/debug.js";

export default function ReactionInput(props) {
  const app = useApp();
  const { t, wsCall } = app;
  const [isProcessing, setIsProcessing] = createSignal(false);
  const [showPalette, setShowPalette] = createSignal(false);
  const [isMouseOver, setIsMouseOver] = createSignal(false);
  const [isGracePeriod, setIsGracePeriod] = createSignal(false);
  let showTimerId, graceTimerId;

  const [myReactionIndex, setMyReactionIndex] = createSignal(
    props.post?._raw?.my_reaction ?? props.post?.my_reaction ?? -1
  );

  createEffect(() => {
    const update = app.postUpdate();
    const authorizedUserAddress = app.authorizedUser()?.address;
    const postId = props.post?._raw?.savva_cid || props.post?.savva_cid;

    if (
      update &&
      update.type === 'reactionsChanged' &&
      update.cid === postId &&
      authorizedUserAddress &&
      update.data?.user?.toLowerCase() === authorizedUserAddress.toLowerCase()
    ) {
      setMyReactionIndex(update.data.reaction);
    }
  });

  onCleanup(() => {
    if (showTimerId) clearTimeout(showTimerId);
    if (graceTimerId) clearTimeout(graceTimerId);
  });

  const handleContainerEnter = () => {
    setIsMouseOver(true);
    if (showTimerId) clearTimeout(showTimerId);
    if (showPalette()) return; // Don't restart timers if already visible

    showTimerId = setTimeout(() => {
      setShowPalette(true);
      setIsGracePeriod(true);
      if (graceTimerId) clearTimeout(graceTimerId);
      graceTimerId = setTimeout(() => {
        setIsGracePeriod(false);
        // If mouse left during grace period, hide now.
        if (!isMouseOver()) {
          setShowPalette(false);
        }
      }, 3000); // 3-second grace period
    }, 1000);
  };

  const handleContainerLeave = () => {
    setIsMouseOver(false);
    if (showTimerId) clearTimeout(showTimerId);
    // Only hide if not in the grace period
    if (!isGracePeriod()) {
      setShowPalette(false);
    }
  };

  const sendReaction = async (reactionIndex) => {
    if (isProcessing()) return;
    setIsProcessing(true);
    
    const postId = props.post?._raw?.savva_cid || props.post?.savva_cid;

    try {
      await wsCall('react', {
        domain: app.selectedDomainName(),
        'obj-type': 0,
        'obj-id': postId,
        n: 0,
        reaction: reactionIndex,
      });
    } catch (e) {
      pushErrorToast(e, { context: "Failed to submit reaction" });
      dbg.error("ReactionInput", "Failed to send reaction", e);
    } finally {
      setIsProcessing(false);
      setShowPalette(false);
      setIsGracePeriod(false);
      if (graceTimerId) clearTimeout(graceTimerId);
    }
  };

  const handleMainButtonClick = () => {
    const newReaction = myReactionIndex() >= 0 ? -1 : 0; // Toggle 'like'
    sendReaction(newReaction);
  };

  const hasReacted = createMemo(() => myReactionIndex() >= 0);
  const reactionType = createMemo(() => {
    const index = myReactionIndex();
    return index >= 0 ? REACTION_TYPES[index] : 'like';
  });
  const reactionLabel = createMemo(() => t(`reactions.${reactionType()}`));

  return (
    <div 
      class="relative inline-block" 
      onMouseEnter={handleContainerEnter}
      onMouseLeave={handleContainerLeave}
    >
      <Show when={showPalette()}>
        <div class="absolute bottom-full left-0 p-1.5 flex items-center gap-1 rounded-full bg-[hsl(var(--popover))] shadow-lg border border-[hsl(var(--border))]">
          <For each={REACTION_TYPES}>
            {(type, index) => (
              <button 
                onClick={() => sendReaction(index())}
                class="p-1 rounded-full hover:bg-[hsl(var(--accent))]"
                title={t(`reactions.${type}`)}
              >
                <ReactionIcon type={type} class="text-xl" />
              </button>
            )}
          </For>
        </div>
      </Show>

      <button
        onClick={handleMainButtonClick}
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
    </div>
  );
}