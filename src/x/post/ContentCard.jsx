// src/x/post/ContentCard.jsx
import { Switch, Match, Show, createMemo } from "solid-js";
import PostCard from "./PostCard.jsx";
import CommentCard from "./CommentCard.jsx";

/**
 * Smart wrapper that renders a PostCard or CommentCard.
 * Accepts either `{ id, _raw }` or a raw object.
 */
export default function ContentCard(props) {
  const item = () => props.item || props.postInfo || props.content;
  const raw = createMemo(() => item()?._raw || item());

  const isComment = createMemo(() => {
    const parent = raw()?.savva_content?.parent_savva_cid;
    return !!parent && String(parent).length > 0;
  });

  // PostCard expects { id, _raw }; normalize when only raw is provided.
  const postCardItem = createMemo(() => {
    const it = item();
    if (it?._raw) return it;
    const r = raw();
    if (!r) return null;
    return { id: r.savva_cid || r.savvaCID || r.id, _raw: r };
  });

  return (
    <Switch>
      <Match when={isComment()}>
        <CommentCard comment={raw()} level={props.level || 0} />
      </Match>
      <Match when={!isComment()}>
        <Show when={postCardItem()}>
          <PostCard
            item={postCardItem()}
            mode={props.mode || "list"}
            compact={props.compact ?? false}
          />
        </Show>
      </Match>
    </Switch>
  );
}
