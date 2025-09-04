// src/x/post/PostFundCard.jsx
import { Show, createSignal, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import ContributeModal from "./ContributeModal.jsx";
import Countdown from "../ui/Countdown.jsx";
import { walletAccount } from "../../blockchain/wallet.js";

export default function PostFundCard(props) {
  const app = useApp();
  const fund = () => props.post?.fund;
  const [showContributeModal, setShowContributeModal] = createSignal(false);

  const savvaTokenAddress = createMemo(() => app.info()?.savva_contracts?.SavvaToken?.address);

  const roundTime = createMemo(() => Number(fund()?.round_time || 0));
  const nowInSeconds = createMemo(() => Math.floor(Date.now() / 1000));
  const isRoundExpecting = createMemo(() => roundTime() > 0 && roundTime() <= nowInSeconds());

  return (
    <>
      <div
        class="rounded-lg p-4 bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-sm space-y-3 flex flex-col"
        aria-label={app.t("post.fund.title")}
      >
        <h4 class="font-semibold uppercase text-center">{app.t("post.fund.title")}</h4>

        <div class="flex-grow flex items-center justify-center">
          <Show
            when={fund()?.amount > 0 && fund()?.round_time > 0}
            fallback={
              <p class="text-xs text-[hsl(var(--muted-foreground))] text-center leading-relaxed">
                {app.t("post.fund.explanation")}
              </p>
            }
          >
            <TokenValue
                amount={fund().amount}
                tokenAddress={savvaTokenAddress()}
            />
          </Show>
        </div>

        <Show when={fund()?.amount > 0 && fund()?.round_time > 0}>
            <div class="flex justify-center items-center h-12">
                <Show when={roundTime() > nowInSeconds()}>
                    <Countdown targetTs={roundTime()} size="sm" labelPosition="top" labelStyle="short" />
                </Show>
                <Show when={isRoundExpecting()}>
                    <div class="text-center">
                        <p class="text-sm font-semibold text-[hsl(var(--muted-foreground))]">
                            {app.t("post.fund.expectingRound")}
                        </p>
                        <div class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                            <span>{app.t("post.fund.roundAmount")}: </span>
                            <TokenValue
                                amount={fund().round_value}
                                tokenAddress={savvaTokenAddress()}
                            />
                        </div>
                    </div>
                </Show>
            </div>
        </Show>

        <Show when={walletAccount()}>
          <button
            onClick={() => setShowContributeModal(true)}
            class="w-full px-4 py-2 mt-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isRoundExpecting()}
          >
            {app.t("post.fund.contribute")}
          </button>
        </Show>
      </div>

      <ContributeModal
        isOpen={showContributeModal()}
        onClose={() => setShowContributeModal(false)}
        post={props.post}
      />
    </>
  );
}

