// src/components/feed/PostListView.jsx
import { For, createMemo, createEffect } from "solid-js";
import PostCard from "./PostCard.jsx";

export default function PostListView(props) {
  const mode = () => (props.mode === "grid" ? "grid" : "list");

  // --- DEBUG LOG ---
  createEffect(() => {
    console.log("[DEBUG in PostListView] Received props.isRailVisible:", props.isRailVisible);
  });
  // --- END DEBUG LOG ---

  const gridClass = createMemo(() => {
    const base = "grid gap-3 grid-cols-1 sm:grid-cols-2";
    return props.isRailVisible
      ? `${base} lg:grid-cols-3 xl:grid-cols-3`
      : `${base} lg:grid-cols-4 xl:grid-cols-4`;
  });

  return (
    <div class={mode() === "grid" ? gridClass() : "flex flex-col gap-3"}>
      <For each={props.items}>
        {(item) => <PostCard item={item} />}
      </For>
    </div>
  );
}
