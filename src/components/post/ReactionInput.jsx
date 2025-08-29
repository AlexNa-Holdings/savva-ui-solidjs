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
  const [paletteStyle, setPaletteStyle] = createSignal({});
  let containerRef;
  let showTimerId, graceTimerId;

  const [myReactionIndex, setMyReactionIndex] = createSignal(
    props.post?._raw?.my_reaction ?? props.post?.my_reaction ?? -1
  );

  createEffect(() => {
    const update = app.postUpdate();
    const authorizedUserAddress = app.authorizedUser()?.address;
    const postId = props.post?._raw?.savva_cid || props.post?.savva_cid || props.post?.id;

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
  
  // This effect calculates the palette's horizontal position dynamically
  createEffect(() => {
    if (showPalette() && containerRef) {
      const buttonRect = containerRef.getBoundingClientRect();
      const paletteWidth = 300; // Estimated width of the palette
      const screenPadding = 10;

      // 1. Calculate the ideal centered position's LEFT EDGE relative to the VIEWPORT
      const idealViewportLeft = buttonRect.left + (buttonRect.width / 2) - (paletteWidth / 2);

      let finalRelativeLeft;

      // 2. Check for right viewport overflow
      if (idealViewportLeft + paletteWidth > window.innerWidth - screenPadding) {
        // Align palette's right edge with button's right edge
        finalRelativeLeft = buttonRect.width - paletteWidth;
      } 
      // 3. Check for left viewport overflow
      else if (idealViewportLeft < screenPadding) {
        // Align palette's left edge with button's left edge
        finalRelativeLeft = 0;
      } 
      // 4. Default: Center the palette relative to the button
      else {
        finalRelativeLeft = (buttonRect.width / 2) - (paletteWidth / 2);
      }
      
      // We only need to set the left property for our absolutely positioned element.
      setPaletteStyle({ left: `${finalRelativeLeft}px` });
    }
  });

  onCleanup(() => {
    if (showTimerId) clearTimeout(showTimerId);
    if (graceTimerId) clearTimeout(graceTimerId);
  });

  const handleContainerEnter = () => {
    setIsMouseOver(true);
    if (showTimerId) clearTimeout(showTimerId);
    if (showPalette()) return; 

    showTimerId = setTimeout(() => {
      setShowPalette(true);
      setIsGracePeriod(true);
      if (graceTimerId) clearTimeout(graceTimerId);
      graceTimerId = setTimeout(() => {
        setIsGracePeriod(false);
        if (!isMouseOver()) {
          setShowPalette(false);
        }
      }, 3000);
    }, 1000);
  };

  const handleContainerLeave = () => {
    setIsMouseOver(false);
    if (showTimerId) clearTimeout(showTimerId);
    if (!isGracePeriod()) {
      setShowPalette(false);
    }
  };

  const sendReaction = async (reactionIndex) => {
    if (isProcessing()) return;
    setIsProcessing(true);
    
    const postId = props.post?._raw?.savva_cid || props.post?.savva_cid || props.post?.id;

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
    const newReaction = myReactionIndex() >= 0 ? -1 : 0; 
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
      class="relative inline-block reaction-input-container" 
      onMouseEnter={handleContainerEnter}
      onMouseLeave={handleContainerLeave}
      ref={containerRef}
    >
      <Show when={showPalette()}>
        <div 
          class="absolute bottom-full z-50 mb-1 p-1.5 flex items-center gap-1 rounded-full bg-[hsl(var(--popover))] shadow-lg border border-[hsl(var(--border))]"
          style={paletteStyle()}
        >
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
        class="flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold hover:bg-[hsl(var(--accent))] disabled:opacity-50 w-[80px]"
        classList={{
          "text-[hsl(var(--muted-foreground))]": !hasReacted(),
          "text-blue-500": hasReacted()
        }}
      >
        <Show
          when={hasReacted()}
          fallback={<span class="filter grayscale text-lg">👍</span>}
        >
          <ReactionIcon type={reactionType()} class="text-lg" />
        </Show>
        <span>{reactionLabel()}</span>
      </button>
    </div>
  );
}