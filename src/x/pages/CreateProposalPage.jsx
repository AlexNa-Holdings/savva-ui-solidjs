// src/x/pages/CreateProposalPage.jsx
import { Show, createSignal, createMemo, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { navigate } from "../../routing/smartRouter.js";
import ClosePageButton from "../ui/ClosePageButton.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import AmountInput from "../ui/AmountInput.jsx";
import ProposalActionsBuilder from "../governance/ProposalActionsBuilder.jsx";

export default function CreateProposalPage() {
  const app = useApp();
  const { t } = app;

  const [description, setDescription] = createSignal("");
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [governanceBalance, setGovernanceBalance] = createSignal(0n);
  const [proposalPrice, setProposalPrice] = createSignal(0n);
  const [depositAmount, setDepositAmount] = createSignal("");
  const [withdrawAmount, setWithdrawAmount] = createSignal("");
  const [isDepositing, setIsDepositing] = createSignal(false);
  const [isWithdrawing, setIsWithdrawing] = createSignal(false);
  const [actions, setActions] = createSignal([]);
  const [votingPower, setVotingPower] = createSignal(0n);
  const [proposalThreshold, setProposalThreshold] = createSignal(0n);
  const [dataLoaded, setDataLoaded] = createSignal(false);

  // Get Staking token address (SAVVA_VOTES)
  const stakingTokenAddress = createMemo(() => {
    return app.info()?.savva_contracts?.Staking?.address || "";
  });

  /**
   * Check if user has sufficient balance
   */
  const hasSufficientBalance = createMemo(() => {
    return governanceBalance() >= proposalPrice();
  });

  /**
   * Check if user has sufficient voting power
   */
  const hasSufficientVotingPower = createMemo(() => {
    return votingPower() >= proposalThreshold();
  });

  /**
   * Fetch governance balance, proposal price, voting power, and threshold
   */
  const fetchBalanceAndPrice = async () => {
    const account = app.actorAddress?.();
    if (!account) return;

    setDataLoaded(false);
    try {
      const { getSavvaContract } = await import("../../blockchain/contracts.js");
      const governance = await getSavvaContract(app, "Governance", { read: true });

      // Fetch actor's balance in governance contract
      const balance = await governance.read.balances([account]);
      setGovernanceBalance(balance);

      // Fetch proposal price from Config contract
      const config = await getSavvaContract(app, "Config", { read: true });
      const keyBytes32 = (await import("viem")).toHex("gov_proposal_price", { size: 32 });
      const price = await config.read.getUInt([keyBytes32]);
      setProposalPrice(price);

      // Fetch proposal threshold from Governance contract
      const threshold = await governance.read.proposalThreshold();
      setProposalThreshold(threshold);

      // Fetch actor's voting power (delegated token balance)
      const staking = await getSavvaContract(app, "Staking", { read: true });
      const votes = await staking.read.getVotes([account]);
      setVotingPower(votes);

      setDataLoaded(true);
    } catch (error) {
      console.error("Failed to fetch governance data:", error);
      setDataLoaded(true);
    }
  };

  /**
   * Handle deposit
   */
  const handleDeposit = async () => {
    if (!depositAmount() || isDepositing()) return;

    setIsDepositing(true);
    try {
      const { getSavvaContract } = await import("../../blockchain/contracts.js");
      const { parseEther } = await import("viem");
      const { pushToast, pushErrorToast } = await import("../../ui/toast.js");

      const governance = await getSavvaContract(app, "Governance", { write: true });
      const amountWei = parseEther(depositAmount());

      const toastId = pushToast({
        type: "info",
        message: t("governance.depositing"),
        autohideMs: 0,
      });

      try {
        const hash = await governance.write.deposit([], { value: amountWei });

        const publicClient = app.publicClient?.();
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash });
        }

        pushToast({
          type: "success",
          message: t("governance.depositSuccess"),
        });

        setDepositAmount("");
        await fetchBalanceAndPrice();
      } finally {
        pushToast({ type: "close", id: toastId });
      }
    } catch (error) {
      console.error("Failed to deposit:", error);
      const { pushErrorToast } = await import("../../ui/toast.js");
      pushErrorToast(error, { message: t("governance.depositFailed") });
    } finally {
      setIsDepositing(false);
    }
  };

  /**
   * Handle withdraw
   */
  const handleWithdraw = async () => {
    if (!withdrawAmount() || isWithdrawing()) return;

    setIsWithdrawing(true);
    try {
      const { getSavvaContract } = await import("../../blockchain/contracts.js");
      const { parseEther } = await import("viem");
      const { pushToast, pushErrorToast } = await import("../../ui/toast.js");

      const governance = await getSavvaContract(app, "Governance", { write: true });
      const amountWei = parseEther(withdrawAmount());

      const toastId = pushToast({
        type: "info",
        message: t("governance.withdrawing"),
        autohideMs: 0,
      });

      try {
        const hash = await governance.write.withdraw([amountWei]);

        const publicClient = app.publicClient?.();
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash });
        }

        pushToast({
          type: "success",
          message: t("governance.withdrawSuccess"),
        });

        setWithdrawAmount("");
        await fetchBalanceAndPrice();
      } finally {
        pushToast({ type: "close", id: toastId });
      }
    } catch (error) {
      console.error("Failed to withdraw:", error);
      const { pushErrorToast } = await import("../../ui/toast.js");
      pushErrorToast(error, { message: t("governance.withdrawFailed") });
    } finally {
      setIsWithdrawing(false);
    }
  };

  /**
   * Fetch data on mount and when actor changes
   */
  createEffect(() => {
    const actorAddr = app.actorAddress?.();
    if (actorAddr) {
      fetchBalanceAndPrice();
    }
  });

  /**
   * Handle submit
   */
  const handleSubmit = async () => {
    if (!description().trim() || !hasSufficientBalance() || !hasSufficientVotingPower()) return;

    setIsSubmitting(true);
    try {
      const { getSavvaContract } = await import("../../blockchain/contracts.js");
      const { pushToast, pushErrorToast } = await import("../../ui/toast.js");

      const governance = await getSavvaContract(app, "Governance", { write: true });

      // Build arrays from actions
      const builtActions = actions();
      const targets = builtActions.map(a => a.target);
      const values = builtActions.map(a => BigInt(a.value || "0"));
      const calldatas = builtActions.map(a => a.calldata);

      // Append current date and time to description to ensure uniqueness
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const timestamp = `${day}.${month}.${year} ${hours}:${minutes}`;
      const uniqueDescription = `${description()}\n\n(${timestamp})`;

      const toastId = pushToast({
        type: "info",
        message: t("governance.creating"),
        autohideMs: 0,
      });

      try {
        const hash = await governance.write.propose([
          targets,
          values,
          calldatas,
          uniqueDescription
        ]);

        const publicClient = app.publicClient?.();
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash });
        }

        pushToast({
          type: "success",
          message: t("governance.createSuccess"),
        });

        // Navigate back to governance page
        navigate("/governance");
      } finally {
        pushToast({ type: "close", id: toastId });
      }
    } catch (error) {
      console.error("Failed to create proposal:", error);
      const { pushErrorToast } = await import("../../ui/toast.js");
      pushErrorToast(error, { message: t("governance.createFailed") });
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Add action to the list
   */
  const handleAddAction = (action) => {
    setActions([...actions(), action]);
  };

  /**
   * Remove action from the list
   */
  const handleRemoveAction = (index) => {
    setActions(actions().filter((_, i) => i !== index));
  };

  return (
    <main class="container mx-auto px-4 py-8 max-w-4xl">
      <ClosePageButton />

      {/* Header */}
      <div class="mb-6">
        <h1 class="text-3xl font-bold">{t("governance.createProposal")}</h1>
      </div>

      <div class="space-y-6">
        {/* Balance & Deposit Section */}
        <div class="p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <h2 class="text-xl font-semibold mb-4">{t("governance.proposalDeposit")}</h2>

          <p class="text-sm text-muted-foreground mb-4">
            {t("governance.proposalDepositDescription")}
          </p>

          <div class="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div class="text-xs text-muted-foreground mb-1">{t("governance.yourBalance")}</div>
              <div class="text-lg font-semibold">
                <TokenValue amount={governanceBalance()} tokenAddress="0" />
              </div>
            </div>
            <div>
              <div class="text-xs text-muted-foreground mb-1">{t("governance.requiredDeposit")}</div>
              <div class="text-lg font-semibold">
                <TokenValue amount={proposalPrice()} tokenAddress="0" />
              </div>
            </div>
          </div>

          <Show when={dataLoaded() && !hasSufficientBalance()}>
            <div class="mb-4 p-3 rounded-md bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700">
              <p class="text-sm text-yellow-800 dark:text-yellow-400 font-medium">
                {t("governance.insufficientBalance")}
              </p>
            </div>
          </Show>

          <div class="grid grid-cols-2 gap-6">
            {/* Deposit */}
            <div>
              <AmountInput
                value={depositAmount()}
                onChange={(data) => setDepositAmount(data.text)}
                placeholder="0.0"
                label={t("governance.depositAmount")}
              />
              <button
                class="w-full mt-2 px-4 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))]/90 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleDeposit}
                disabled={isDepositing() || !depositAmount() || Number(depositAmount()) === 0}
              >
                {isDepositing() ? t("governance.depositing") : t("governance.deposit")}
              </button>
            </div>

            {/* Withdraw */}
            <div>
              <AmountInput
                value={withdrawAmount()}
                onChange={(data) => setWithdrawAmount(data.text)}
                balance={governanceBalance()}
                placeholder="0.0"
                label={t("governance.withdrawAmount")}
              />
              <button
                class="w-full mt-2 px-4 py-2 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleWithdraw}
                disabled={isWithdrawing() || !withdrawAmount() || Number(withdrawAmount()) === 0}
              >
                {isWithdrawing() ? t("governance.withdrawing") : t("governance.withdraw")}
              </button>
            </div>
          </div>
        </div>

        {/* Voting Power Section */}
        <div class="p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <h2 class="text-xl font-semibold mb-4">{t("governance.yourVotingPower")}</h2>

          <p class="text-sm text-muted-foreground mb-4">
            {t("governance.votingPowerDescription")}
          </p>

          <div class="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div class="text-xs text-muted-foreground mb-1">{t("governance.yourVotingPower")}</div>
              <div class="text-lg font-semibold">
                <TokenValue amount={votingPower()} tokenAddress={stakingTokenAddress()} />
              </div>
            </div>
            <div>
              <div class="text-xs text-muted-foreground mb-1">{t("governance.proposalThreshold")}</div>
              <div class="text-lg font-semibold">
                <TokenValue amount={proposalThreshold()} tokenAddress={stakingTokenAddress()} />
              </div>
            </div>
          </div>

          <Show when={dataLoaded() && !hasSufficientVotingPower()}>
            <div class="p-3 rounded-md bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700">
              <p class="text-sm text-red-800 dark:text-red-400 font-medium">
                {t("governance.insufficientVotingPower")}
              </p>
            </div>
          </Show>
        </div>

        {/* Proposal Actions */}
        <div class="p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <ProposalActionsBuilder
            actions={actions()}
            onAdd={handleAddAction}
            onRemove={handleRemoveAction}
          />
        </div>

        {/* Proposal Description */}
        <div class="p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <label class="block text-lg font-semibold mb-3">
            {t("governance.proposalDescription")}
          </label>
          <textarea
            class="w-full px-3 py-2 border border-[hsl(var(--border))] rounded-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            rows="6"
            placeholder={t("governance.proposalDescriptionPlaceholder")}
            value={description()}
            onInput={(e) => setDescription(e.target.value)}
            disabled={!hasSufficientBalance() || !hasSufficientVotingPower()}
          />
        </div>

        {/* Action Buttons */}
        <div class="flex gap-3 justify-end">
          <button
            class="px-6 py-2 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]"
            onClick={() => navigate("/governance")}
            disabled={isSubmitting()}
          >
            {t("common.cancel")}
          </button>
          <button
            class="px-6 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))]/90 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSubmit}
            disabled={isSubmitting() || !description().trim() || !hasSufficientBalance() || !hasSufficientVotingPower()}
          >
            {isSubmitting() ? t("governance.creating") : t("governance.createProposal")}
          </button>
        </div>
      </div>
    </main>
  );
}
