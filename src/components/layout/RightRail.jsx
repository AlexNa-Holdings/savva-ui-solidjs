// src/components/layout/RightRail.jsx
import { For, Switch, Match } from "solid-js";
import HtmlBlock from "../widgets/HtmlBlock.jsx";
import ContentListBlock from "../widgets/ContentListBlock.jsx";

export default function RightRail(props) {
  const blocks = () => props.config?.blocks || [];

  return (
    <For each={blocks()}>
      {(block, i) => (
        <div classList={{ "border-t border-[hsl(var(--border))]": i() > 0 }}>
          <Switch>
            <Match when={block.type === 'html'}>
              <HtmlBlock block={block} />
            </Match>
            <Match when={block.type === 'content_List'}>
              <ContentListBlock block={block} />
            </Match>
          </Switch>
        </div>
      )}
    </For>
  );
}