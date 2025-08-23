// src/components/ui/PostReactions.jsx
import { For, createMemo, Show } from "solid-js";
import ReactionIcon from "./icons/ReactionIcon.jsx";

const REACTION_TYPES = [
  "like", "super", "ha_ha", "sad", "angry", 
  "wow", "trophy", "hot", "clap", "dislike"
];

export default function PostReactions(props) {
  const reactionsWithCount = createMemo(() => {
    const counts = props.item?._raw?.reactions || [];
    return REACTION_TYPES.map((type, i) => ({
      type,
      count: counts[i] || 0,
    })).filter(r => r.count > 0);
  });

  const totalReactions = createMemo(() => {
    return (props.item?._raw?.reactions || []).reduce((sum, count) => sum + (count || 0), 0);
  });

  return (
    <Show when={totalReactions() > 0}>
      <div class="flex items-center text-xs">
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