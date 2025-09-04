// src/x/ui/PostReactions.jsx
import { For, createMemo, Show, createSignal, createEffect, on } from "solid-js";
import ReactionIcon from "./icons/ReactionIcon.jsx";

const REACTION_TYPES = [
  "like", "super", "ha_ha", "sad", "angry", 
  "wow", "trophy", "hot", "clap", "dislike"
];

export default function PostReactions(props) {
  const [isAnimating, setIsAnimating] = createSignal(false);
  const sourceReactions = createMemo(() => props.item?._raw?.reactions || props.item?.reactions || []);
  
  // This signal holds what is currently visible on screen.
  const [displayReactions, setDisplayReactions] = createSignal(sourceReactions());

  const reactionsWithCount = createMemo(() => {
    const counts = displayReactions(); // Render based on the display signal
    return REACTION_TYPES.map((type, i) => ({
      type,
      count: counts[i] || 0,
    })).filter(r => r.count > 0);
  });

  const totalReactions = createMemo(() => {
    // Render based on the display signal
    return (displayReactions() || []).reduce((sum, count) => sum + (count || 0), 0);
  });

  // The effect now receives the new and previous values from `on`.
  createEffect(on(sourceReactions, (newReactions, prevReactions) => {
    // Don't animate on the initial render
    if (prevReactions === undefined) {
      setDisplayReactions(newReactions);
      return;
    }

    // 1. Start the animation, showing the OLD value first.
    setDisplayReactions(prevReactions);
    setIsAnimating(true);

    // 2. Halfway through the 400ms animation, swap to the NEW value.
    setTimeout(() => {
      setDisplayReactions(newReactions);
    }, 200);

    // 3. After the animation is complete, remove the animation class.
    setTimeout(() => {
      setIsAnimating(false);
    }, 400);

  }, { defer: true }));

  return (
    <Show when={totalReactions() > 0 || isAnimating()}>
      <div 
        class="flex items-center text-xs"
        classList={{ "default-animation": isAnimating() }}
      >
        <div class="flex items-center">
          <For each={reactionsWithCount()}>
            {(reaction) => <ReactionIcon type={reaction.type} />}
          </For>
        </div>
        <Show when={totalReactions() > 1}>
          <div class=" ml-0">{totalReactions()}</div>
        </Show>
      </div>
    </Show>
  );
}