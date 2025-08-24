// src/components/feed/PostInfo.jsx
import { Show, createMemo } from "solid-js";
import { formatUnits } from "viem";
import { useApp } from "../../context/AppContext.jsx";
import SavvaTokenIcon from "../ui/icons/SavvaTokenIcon.jsx";
import PostTime from "../ui/PostTime.jsx";
import PostReactions from "../ui/PostReactions.jsx";

function PostComments(props) {
  const count = () => props.item?._raw?.total_childs || props.item?.total_childs || 0;
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
    const rawAmount = props.item?._raw?.fund?.total_author_share || props.item?.fund?.total_author_share;
    if (!rawAmount) return 0;
    const formatted = formatUnits(BigInt(rawAmount), 18);
    return parseFloat(formatted);
  });

  const localizedAmount = createMemo(() => {
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
  const postData = createMemo(() => props.item?._raw || props.item || {});

  return (
    <div class={`flex items-center ${isListMode() ? 'gap-2' : 'gap-4'} ${props.hideTopBorder ? '' : 'pt-2 border-t border-[hsl(var(--border))]'}`}>
      <PostTime 
        timestamp={postData().effective_time} 
        format={props.timeFormat || "short"} 
      />
      <PostReactions item={props.item} />
      <PostComments item={props.item} />
      {/* --- MODIFICATION: Rewards alignment is now conditional --- */}
      <div class={props.rewardsAlign === 'left' ? '' : 'ml-auto'}>
        <PostRewards item={props.item} lang={lang} />
      </div>
    </div>
  );
}