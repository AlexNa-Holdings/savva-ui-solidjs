// src/x/feed/PostInfo.jsx
import { Show, createMemo, createSignal, createEffect, on, onMount, onCleanup } from "solid-js";
import { formatUnits } from "viem";
import { useApp } from "../../context/AppContext.jsx";
import SavvaTokenIcon from "../ui/icons/SavvaTokenIcon.jsx";
import PostTime from "../ui/PostTime.jsx";
import PostReactions from "../ui/PostReactions.jsx";
import ReactionInput from "../post/ReactionInput.jsx";

function PostComments(props) {
  const [isAnimating, setIsAnimating] = createSignal(false);
  const sourceCount = createMemo(() => props.item?._raw?.total_childs || props.item?.total_childs || 0);
  const [displayCount, setDisplayCount] = createSignal(sourceCount());

  createEffect(
    on(
      sourceCount,
      (newCount, prevCount) => {
        if (prevCount === undefined) {
          setDisplayCount(newCount);
          return;
        }
        setDisplayCount(prevCount);
        setIsAnimating(true);
        setTimeout(() => setDisplayCount(newCount), 200);
        setTimeout(() => setIsAnimating(false), 400);
      },
      { defer: true }
    )
  );

  return (
    <Show when={displayCount() > 0 || isAnimating()}>
      <div class="flex items-center gap-1 text-xs" classList={{ "default-animation": isAnimating() }}>
        <span style={{ "font-family": "'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif" }}>💬</span>
        <span>{displayCount()}</span>
      </div>
    </Show>
  );
}

function PostRewards(props) {
  const amount = createMemo(() => {
    const rawAmount = props.item?._raw?.fund?.total_author_share || props.item?.fund?.total_author_share;
    if (!rawAmount) return 0;
    const formatted = formatUnits(BigInt(rawAmount), 18);
    return parseFloat(formatted);
  });

  const localizedAmount = createMemo(() => {
    const currentLang = props.lang();
    return amount().toLocaleString(currentLang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  });

  return (
    <Show when={amount() > 0}>
      <div class="flex items-center gap-1 text-xs">
        <span>{localizedAmount()}</span>
        <SavvaTokenIcon class="w-3.5 h-3.5" />
      </div>
    </Show>
  );
}

export default function PostInfo(props) {
  const app = useApp();
  const { lang } = app;

  // Actor-aware: react to actor changes (like on the profile page)
  // Using actorAddress ensures this block updates when user switches between self/NPO.
  const actorAddr = createMemo(() => app.actorAddress?.() || ""); // empty when not selected/connected

  const postData = createMemo(() => props.item?._raw || props.item || {});

  const [width, setWidth] = createSignal(0);
  let containerRef;

  // Responsive visibility thresholds
  const showReactionInput = createMemo(() => width() > 350);
  const showPostReactions = createMemo(() => width() > 260);
  const showPostRewards = createMemo(() => width() > 200);
  const useShortTimeFormat = createMemo(() => width() < 240);

  onMount(() => {
    if (!containerRef) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(containerRef);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div
      ref={containerRef}
      class={`flex w-full items-center justify-between gap-2 ${props.hideTopBorder ? "" : "pt-0.5 border-t border-[hsl(var(--border))]"}`}
    >
      <div class="flex items-center gap-2 min-w-0 whitespace-nowrap">
        <PostTime timestamp={postData().effective_time} format={useShortTimeFormat() ? "short" : props.timeFormat || "long"} />
        <Show when={showPostReactions()}>
          <PostReactions item={props.item} />
        </Show>
        <Show when={showPostRewards()}>
          <PostRewards item={props.item} lang={lang} />
        </Show>
        <PostComments item={props.item} />
      </div>

      <Show when={!props.hideActions && showReactionInput()}>
        <div class="flex-shrink-0">
          {/* Re-render on actor change by depending on actorAddr and passing it down */}
          <Show when={!!actorAddr()}>
            <ReactionInput post={props.item} actorAddr={actorAddr()} />
          </Show>
        </div>
      </Show>
    </div>
  );
}
