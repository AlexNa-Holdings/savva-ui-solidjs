// src/components/feed/PostListView.jsx
import { For } from "solid-js";
import PostCard from "./PostCard.jsx";

export default function PostListView(props) {
  const mode = () => (props.mode === "grid" ? "grid" : "list");

  return (
    <div class={mode() === "grid" ? "grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-3"}>
      <For each={props.items}>
        {(item) => <PostCard item={item} />}
      </For>
    </div>
  );
}