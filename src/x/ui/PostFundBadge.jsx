// src/x/ui/PostFundBadge.jsx
import { createSignal, createEffect, on, createMemo } from "solid-js";
import SavvaTokenIcon from "./icons/SavvaTokenIcon";
import { formatRewardAmount } from "../../blockchain/utils";

export default function PostFundBadge(props) {
  const [isAnimating, setIsAnimating] = createSignal(false);

  const formattedAmount = createMemo(() => {
    return formatRewardAmount(props.amount);
  });

  const triggerAnimation = () => {
    if (isAnimating()) return;
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 300);
  };

  createEffect(on(() => props.amount, triggerAnimation, { defer: true }));

  return (
    <div
      // MODIFICATION: Replaced 'text-white' with the theme-aware card foreground color.
      class="flex items-center gap-2 pl-3 pr-4 py-1.5 rounded-l-full text-[hsl(var(--card))] font-semibold text-base shadow-lg cursor-pointer"
      style={{ background: "var(--gradient)" }}
      classList={{ "animate-bounce-short": isAnimating() }}
      onClick={triggerAnimation}
    >
      <SavvaTokenIcon class="w-5 h-5" />
      <span>{formattedAmount()}</span>
    </div>
  );
}