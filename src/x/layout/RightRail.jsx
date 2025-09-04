// src/x/layout/RightRail.jsx
import { For, Switch, Match } from "solid-js";
import HtmlBlock from "../widgets/HtmlBlock.jsx";
import ContentListBlock from "../widgets/ContentListBlock.jsx";

export default function RightRail(props) {
  const blocks = () => props.config?.blocks || [];

  return (
    <For each={blocks()}>
      {(block) => (
        <Switch>
          <Match when={block.type === 'html'}>
            <HtmlBlock block={block} />
          </Match>
          <Match when={block.type === 'content_List'}>
            <ContentListBlock block={block} />
          </Match>
        </Switch>
      )}
    </For>
  );
}