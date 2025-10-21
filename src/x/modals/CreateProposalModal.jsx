// src/x/modals/CreateProposalModal.jsx
import { Show, createSignal, onMount, createMemo, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { walletAccount } from "../../blockchain/wallet.js";
import Modal from "./Modal.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import AmountInput from "../ui/AmountInput.jsx";
import ProposalActionsBuilder from "../governance/ProposalActionsBuilder.jsx";

export default function CreateProposalModal(props) {
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
  const [baseTokenSymbol, setBaseTokenSymbol] = createSignal("PLS");
  const [actions, setActions] = createSignal([]);

  /**
   * Check if user has sufficient balance
   */
  const hasSufficientBalance = createMemo(() => {
    return governanceBalance() >= proposalPrice();
  });

  /**
   * Fetch governance balance and proposal price
   */
  const fetchBalanceAndPrice = async () => {
    const account = walletAccount();
    if (!account) return;

    try {
      const { getSavvaContract } = await import("../../blockchain/contracts.js");
      const governance = await getSavvaContract(app, "Governance", { read: true });

      // Fetch user's balance in governance contract
      const balance = await governance.read.balances([account]);
      console.log("Governance balance:", balance);
      setGovernanceBalance(balance);

      // Fetch proposal price from Config contract
      const config = await getSavvaContract(app, "Config", { read: true });
      const keyBytes32 = (await import("viem")).toHex("gov_proposal_price", { size: 32 });
      const price = await config.read.getUInt([keyBytes32]);
      console.log("Proposal price:", price);
      setProposalPrice(price);

      // Get base token symbol from chain
      const chain = app.desiredChain?.();
      if (chain?.nativeCurrency?.symbol) {
        setBaseTokenSymbol(chain.nativeCurrency.symbol);
      }
    } catch (error) {
      console.error("Failed to fetch governance balance:", error);
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
   * Fetch data when modal opens
   */
  createEffect(() => {
    if (props.isOpen) {
      fetchBalanceAndPrice();
    }
  });

  const handleClose = () => {
    if (!isSubmitting()) {
      setDescription("");
      setDepositAmount("");
      setWithdrawAmount("");
      setActions([]);
      props.onClose?.();
    }
  };

  const handleSubmit = async () => {
    if (!description().trim() || !hasSufficientBalance()) return;

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
          description()
        ]);

        const publicClient = app.publicClient?.();
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash });
        }

        pushToast({
          type: "success",
          message: t("governance.createSuccess"),
        });

        // Close modal and refresh proposals
        handleClose();
        props.onSuccess?.();
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
    <Modal
      isOpen={props.isOpen}
      onClose={handleClose}
      title={t("governance.createProposal")}
      size="6xl"
    >
      <div class="space-y-6">
        {/* Balance Section */}
        <div class="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
          <h3 class="text-lg font-semibold mb-3">{t("governance.proposalDeposit")}</h3>

          <div class="mb-4">
            <p class="text-sm text-muted-foreground mb-2">
              {t("governance.proposalDepositDescription")}
            </p>
          </div>

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

          <Show when={!hasSufficientBalance()}>
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

        {/* Proposal Actions */}
        <ProposalActionsBuilder
          actions={actions()}
          onAdd={handleAddAction}
          onRemove={handleRemoveAction}
        />

        {/* Proposal Description */}
        <div>
          <label class="block text-sm font-medium mb-2">
            {t("governance.proposalDescription")}
          </label>
          <textarea
            class="w-full px-3 py-2 border border-[hsl(var(--border))] rounded-md bg-[hsl(var(--background))] text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            rows="4"
            placeholder={t("governance.proposalDescriptionPlaceholder")}
            value={description()}
            onInput={(e) => setDescription(e.target.value)}
            disabled={!hasSufficientBalance()}
          />
        </div>

        <div class="flex gap-2 justify-end pt-4 border-t border-[hsl(var(--border))]">
          <button
            class="px-4 py-2 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]"
            onClick={handleClose}
            disabled={isSubmitting()}
          >
            {t("common.cancel")}
          </button>
          <button
            class="px-4 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))]/90 disabled:opacity-50"
            onClick={handleSubmit}
            disabled={isSubmitting() || !description().trim() || !hasSufficientBalance()}
          >
            {isSubmitting() ? t("governance.creating") : t("governance.createProposal")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
