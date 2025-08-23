// src/components/ui/icons/ReactionIcon.jsx
import { Show } from "solid-js";

const REACTION_MAP = {
  like: "👍",
  super: "❤️",
  ha_ha: "😂",
  sad: "😢",
  angry: "😡",
  wow: "😮",
  trophy: "🏆",
  hot: "🔥",
  clap: "👏",
  dislike: "👎",
};

export default function ReactionIcon(props) {
  const emoji = () => REACTION_MAP[props.type];
  return (
    <Show when={emoji()}>
      <span
        class={props.class || "text-sm"}
        aria-label={props.type}
        title={props.type}
      >
        {emoji()}
      </span>
    </Show>
  );
}