// src/components/feed/PostInfo.jsx
import { Show, createMemo } from "solid-js";
import { formatUnits } from "viem";
import { useApp } from "../../context/AppContext.jsx";
import SavvaTokenIcon from "../ui/icons/SavvaTokenIcon.jsx";
import PostTime from "../ui/PostTime.jsx";
import PostReactions from "../ui/PostReactions.jsx";

function PostComments(props) {
  const count = () => props.item?._raw?.total_childs || 0;
  return (
    <Show when={count() > 0}>
      <div class="flex items-center gap-1 text-xs">
        <span>💬</span>
        <span>{count()}</span>
      </div>
    </Show>
  );
}

function PostRewards(props) {
  const amount = createMemo(() => {
    const rawAmount = props.item?._raw?.fund?.total_author_share;
    if (!rawAmount) return 0;
    const formatted = formatUnits(BigInt(rawAmount), 18);
    return parseFloat(formatted);
  });

  const localizedAmount = createMemo(() => {
    // Access the lang prop to ensure this memo re-runs on language change
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
  const { lang } = useApp();
  const isListMode = () => props.mode === 'list';

  return (
    <div class={`pt-2 flex items-center border-t border-[hsl(var(--border))] ${isListMode() ? 'gap-2' : 'gap-4'}`}>
      <PostTime timestamp={props.item?._raw?.effective_time} format="short" />
      <PostReactions item={props.item} />
      <PostComments item={props.item} />
      <div class="ml-auto">
        <PostRewards item={props.item} lang={lang} />
      </div>
    </div>
  );
}