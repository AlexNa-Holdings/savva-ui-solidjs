// src/components/feed/PostInfo.jsx
import SavvaTokenIcon from "../ui/icons/SavvaTokenIcon.jsx";
import PostTime from "../ui/PostTime.jsx";

// A placeholder for the reactions block
function PostReactions(props) {
  // TODO: Implement reactions logic
  return <div class="text-xs">❤️ 12</div>;
}

// A placeholder for the comments count
function PostComments(props) {
  // TODO: Implement comments logic
  return <div class="text-xs">💬 5</div>;
}

// A placeholder for the rewards block
function PostRewards(props) {
  // TODO: Implement rewards logic
  return (
    <div class="flex items-center gap-1 text-xs">
      <span>1,234</span>
      <SavvaTokenIcon class="w-3.5 h-3.5" />
    </div>
  );
}

export default function PostInfo(props) {
  const isListMode = () => props.mode === 'list';

  return (
    <div class={`pt-2 flex items-center border-t border-[hsl(var(--border))] ${isListMode() ? 'gap-2' : 'gap-4'}`}>
      <PostTime timestamp={props.item?._raw?.effective_time} format="short" />
      <PostReactions item={props.item} />
      <PostComments item={props.item} />
      <div class="ml-auto">
        <PostRewards item={props.item} />
      </div>
    </div>
  );
}