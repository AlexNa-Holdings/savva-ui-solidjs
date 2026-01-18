// src/x/ui/icons/ReactionIcon.jsx
import { Show } from "solid-js";

const REACTION_MAP = {
  like: "👍",
  love: "❤️",
  ha_ha: "😂",
  sad: "😢",
  angry: "😡",
  wow: "😮",
  trophy: "🏆",
  hot: "🔥",
  clap: "👏",
  dislike: "👎",
};

export const REACTION_TYPES = Object.keys(REACTION_MAP);

export default function ReactionIcon(props) {
  const emoji = () => REACTION_MAP[props.type];
  return (
    <Show when={emoji()}>
      <span
        class={props.class || "text-sm"}
        style={{ "font-family": "'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif" }}
        aria-label={props.type}
      >
        {emoji()}
      </span>
    </Show>
  );
}