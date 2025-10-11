// src/x/post/PostFundCard.jsx
import { Show, createSignal, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import ContributeModal from "../modals/ContributeModal.jsx";
import Countdown from "../ui/Countdown.jsx";
import { walletAccount } from "../../blockchain/wallet.js";
import { dbg } from "../../utils/debug.js";

export default function PostFundCard(props) {
  const app = useApp();

  // This is the key to reactivity. It's a function that accesses the `fund` object from props.
  // Because props are reactive in SolidJS, whenever the parent PostCard updates this post's data,
  // this `fund()` accessor will automatically return the new values.
  const fund = () => props.post?.fund;
  
  const [showContributeModal, setShowContributeModal] = createSignal(false);

  const savvaTokenAddress = createMemo(() => app.info()?.savva_contracts?.SavvaToken?.address);

  // This `createMemo` automatically re-runs whenever `fund()` changes.
  const roundTime = createMemo(() => Number(fund()?.round_time || 0));
  const nowInSeconds = createMemo(() => Math.floor(Date.now() / 1000));
  const isRoundExpecting = createMemo(() => roundTime() > 0 && roundTime() <= nowInSeconds());

  // This also re-runs automatically when `roundTime()` changes.
  const roundEndDateTime = createMemo(() => {
    const ts = roundTime();
    if (!ts) return "";
    const date = new Date(ts * 1000); // Convert seconds to milliseconds
    return new Intl.DateTimeFormat(app.lang(), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  });

  return (
    <>
      <div
        class="rounded-lg p-4 bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-sm space-y-3 flex flex-col"
        aria-label={app.t("post.fund.title")}
      >
        <h4 class="font-semibold uppercase text-center">{app.t("post.fund.title")}</h4>

        <div class="flex-grow flex items-center justify-center">
          {/* This <Show> block automatically re-evaluates when fund() changes. */}
          <Show
            when={fund()?.amount > 0 && fund()?.round_time > 0}
            fallback={
              <p class="text-xs text-[hsl(var(--muted-foreground))] text-center leading-relaxed">
                {app.t("post.fund.explanation")}
              </p>
            }
          >
            {/* This component will receive the new `amount` and re-render. */}
            <TokenValue
                amount={fund().amount}
                tokenAddress={savvaTokenAddress()}
            />
          </Show>
        </div>

        <Show when={fund()?.amount > 0 && fund()?.round_time > 0}>
            <div class="space-y-2 flex flex-col justify-center items-center py-1">
                <Show when={roundTime() > nowInSeconds()}>
                    <div class="flex flex-col items-center">
                        {/* The Countdown will get the new `roundTime` and update. */}
                        <Countdown targetTs={roundTime()} size="sm" labelPosition="top" labelStyle="short" />
                        <div class="text-[10px] text-[hsl(var(--muted-foreground))] opacity-80 mt-1">
                            {roundEndDateTime()}
                        </div>
                    </div>
                    <div class="text-xs text-[hsl(var(--muted-foreground))] text-center">
                        {/* Changed this key as requested */}
                        <span>{app.t("post.fund.nextPrize")}: </span>
                        {/* This will get the new `round_value` and update. */}
                        <TokenValue
                            amount={fund().round_value}
                            tokenAddress={savvaTokenAddress()}
                        />
                    </div>
                </Show>
                <Show when={isRoundExpecting()}>
                    <div class="text-center">
                        <p class="text-sm font-semibold text-[hsl(var(--muted-foreground))]">
                            {app.t("post.fund.expectingRound")}
                        </p>
                    </div>
                </Show>
            </div>
        </Show>

        <div class="pt-2 text-center">
          <Show
            when={walletAccount()}
            fallback={
              <p class="text-xs text-[hsl(var(--muted-foreground))]">
                {app.t("post.fund.connectWallet")}
              </p>
            }
          >
            <button
              onClick={() => setShowContributeModal(true)}
              class="w-full px-4 py-2 mt-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isRoundExpecting()}
            >
              {app.t("post.fund.contribute")}
            </button>
          </Show>
        </div>
      </div>

      <ContributeModal
        isOpen={showContributeModal()}
        onClose={() => setShowContributeModal(false)}
        post={props.post}
      />
    </>
  );
}