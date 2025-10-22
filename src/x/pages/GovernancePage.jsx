// src/x/pages/GovernancePage.jsx
import { Show, For, createSignal, onMount, createMemo, createEffect } from "solid-js";
import { createPublicClient } from "viem";
import { useApp } from "../../context/AppContext.jsx";
import { navigate } from "../../routing/smartRouter.js";
import ClosePageButton from "../ui/ClosePageButton.jsx";
import Spinner from "../ui/Spinner.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import UserCard from "../ui/UserCard.jsx";
import { walletAccount, isWalletAvailable, connectWallet } from "../../blockchain/wallet.js";
import { authorize } from "../../blockchain/auth.js";
import { getSavvaContract, configuredHttp } from "../../blockchain/contracts.js";
import { pushErrorToast } from "../../ui/toast.js";
import DelegateModal from "../modals/DelegateModal.jsx";
import ProposalCard from "../governance/ProposalCard.jsx";

export default function GovernancePage() {
  const app = useApp();
  const { t } = app;

  // State management
  const [busy, setBusy] = createSignal(true);
  const [isConnecting, setIsConnecting] = createSignal(false);
  const [isLoggingIn, setIsLoggingIn] = createSignal(false);

  // Staking and voting data
  const [stakingBalance, setStakingBalance] = createSignal(0n);
  const [votingPower, setVotingPower] = createSignal(0n);
  const [delegatedTo, setDelegatedTo] = createSignal(null);
  const [delegateUser, setDelegateUser] = createSignal(null);
  const [showDelegateModal, setShowDelegateModal] = createSignal(false);

  // Proposals data
  const [proposals, setProposals] = createSignal([]);
  const [loadingProposals, setLoadingProposals] = createSignal(false);
  const [showOnlyActive, setShowOnlyActive] = createSignal(true);

  // Get Staking token address (SAVVA_VOTES)
  const stakingTokenAddress = createMemo(() => {
    return app.info()?.savva_contracts?.Staking?.address || "";
  });

  // Check if user is logged in
  const isLoggedIn = createMemo(() => !!app.authorizedUser?.());

  /**
   * Handle connect wallet button click
   */
  const handleConnectWallet = async () => {
    if (!isWalletAvailable()) return;
    setIsConnecting(true);
    try {
      await connectWallet();
      await app.ensureWalletOnDesiredChain?.();
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      pushErrorToast(error, { message: t("wallet.connectionFailed") });
    } finally {
      setIsConnecting(false);
    }
  };

  /**
   * Handle login button click
   */
  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      await authorize(app);
      // After successful login, load governance data
      await loadGovernanceData();
    } catch (error) {
      console.error("Login failed:", error);
      pushErrorToast(error, { message: t("governance.loginFailed") });
    } finally {
      setIsLoggingIn(false);
    }
  };

  /**
   * Fetch user info for a given address
   */
  async function fetchUserInfo(address) {
    if (!address || address === "0x0000000000000000000000000000000000000000") {
      return null;
    }

    try {
      const wsParams = {
        domain: app.selectedDomainName(),
        user_addr: address
      };

      const actorAddr = app.actorAddress?.();
      if (actorAddr) {
        wsParams.caller = actorAddr;
      }

      const userData = await app.wsCall?.("get-user", wsParams);
      return userData || { address };
    } catch (error) {
      console.error("Failed to fetch user info:", error);
      return { address };
    }
  }

  /**
   * Load governance data (staking balance, voting power, delegation)
   */
  async function loadGovernanceData() {
    const actorAddr = app.actorAddress?.();
    if (!actorAddr) return;

    try {
      // Get Staking contract
      const staking = await getSavvaContract(app, "Staking", { read: true });

      // Fetch staking balance
      const balance = await staking.read.balanceOf([actorAddr]);
      setStakingBalance(balance);

      // Fetch voting power (current votes)
      const votes = await staking.read.getVotes([actorAddr]);
      setVotingPower(votes);

      // Fetch delegation status
      const delegate = await staking.read.delegates([actorAddr]);
      setDelegatedTo(delegate);

      // Fetch user info for delegate (including self)
      if (delegate && delegate.toLowerCase() !== "0x0000000000000000000000000000000000000000") {
        const userInfo = await fetchUserInfo(delegate);
        setDelegateUser(userInfo);
      }

      console.log("Governance data loaded:", {
        account: actorAddr,
        balance: balance.toString(),
        votes: votes.toString(),
        delegate,
      });
    } catch (error) {
      console.error("Failed to load governance data:", error);
      pushErrorToast(error, { message: t("governance.loadError") });
    }
  }

  /**
   * Load proposals from API
   */
  async function loadProposals() {
    setLoadingProposals(true);
    try {
      const actorAddr = app.actorAddress?.();

      // Get current block number from blockchain
      let currentBlock = 0n;
      try {
        const publicClient = app.publicClient?.();
        if (publicClient) {
          currentBlock = await publicClient.getBlockNumber();
        } else {
          // Fallback: create a public client if not available in app context
          const chain = app.desiredChain?.();
          if (chain) {
            const pc = createPublicClient({
              chain,
              transport: configuredHttp(chain.rpcUrls[0])
            });
            currentBlock = await pc.getBlockNumber();
          }
        }
      } catch (blockError) {
        console.error("Failed to fetch current block number:", blockError);
        // Continue without block number - backend should handle this gracefully
      }

      const params = {
        active: showOnlyActive(),
        caller: actorAddr || "",
        current_block: Number(currentBlock),
        limit: 50,
        offset: 0,
      };

      const result = await app.wsCall?.("get-proposals", params);
      setProposals(Array.isArray(result) ? result : []);
      console.log("Proposals loaded:", result);
    } catch (error) {
      console.error("Failed to load proposals:", error);
      pushErrorToast(error, { message: t("governance.proposalsLoadError") });
    } finally {
      setLoadingProposals(false);
    }
  }

  /**
   * Handle toggle of active filter
   */
  const handleToggleActive = async () => {
    setShowOnlyActive(!showOnlyActive());
    await loadProposals();
  };

  /**
   * Check if user has delegated their votes
   */
  const hasDelegated = createMemo(() => {
    const delegate = delegatedTo();
    return delegate && delegate.toLowerCase() !== "0x0000000000000000000000000000000000000000";
  });

  /**
   * Check if actor delegated to themselves
   */
  const isDelegatedToSelf = createMemo(() => {
    const actorAddr = app.actorAddress?.();
    const delegate = delegatedTo();
    return actorAddr && delegate && actorAddr.toLowerCase() === delegate.toLowerCase();
  });

  /**
   * Handle successful delegation
   */
  const handleDelegationSuccess = async () => {
    setShowDelegateModal(false);
    await loadGovernanceData();
  };

  /**
   * Handle vote on proposal
   * @param {object} proposal - The proposal to vote on
   * @param {number} support - 0 = Against, 1 = For, 2 = Abstain
   */
  const handleVote = async (proposal, support) => {
    if (!proposal?.proposal_id) return;

    try {
      const { pushToast, pushErrorToast } = await import("../../ui/toast.js");

      const governance = await getSavvaContract(app, "Governance", { write: true });
      const proposalId = BigInt(proposal.proposal_id);

      const toastId = pushToast({
        type: "info",
        message: t("governance.voting"),
        autohideMs: 0,
      });

      try {
        const hash = await governance.write.castVote([proposalId, support]);

        const publicClient = app.publicClient?.();
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash });
        }

        pushToast({
          type: "success",
          message: t("governance.voteSuccess"),
        });

        // Reload proposals to reflect the vote
        await loadProposals();
      } finally {
        pushToast({ type: "close", id: toastId });
      }
    } catch (error) {
      console.error("Failed to vote:", error);
      pushErrorToast(error, { message: t("governance.voteFailed") });
    }
  };

  // Initialize on mount
  onMount(async () => {
    try {
      if (isLoggedIn()) {
        await Promise.all([
          loadGovernanceData(),
          loadProposals()
        ]);
      }
    } finally {
      setBusy(false);
    }
  });

  // Reload data when actor changes
  createEffect(() => {
    const actorAddr = app.actorAddress?.();
    if (actorAddr && !busy()) {
      loadGovernanceData();
      loadProposals();
    }
  });

  return (
    <main class="p-4 max-w-6xl mx-auto">
      <ClosePageButton />

      <h1 class="text-3xl font-bold mb-6">{t("governance.title")}</h1>

      <Show when={!busy()} fallback={<Spinner />}>
        <Show
          when={isLoggedIn()}
          fallback={
            <div class="p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-center">
              <Show
                when={walletAccount()}
                fallback={
                  <>
                    <p class="mb-4 text-lg">{t("governance.connectWallet")}</p>
                    <Show
                      when={isWalletAvailable()}
                      fallback={
                        <p class="text-sm text-muted-foreground">{t("wallet.notAvailable")}</p>
                      }
                    >
                      <button
                        class="px-6 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))]/90 disabled:opacity-50"
                        onClick={handleConnectWallet}
                        disabled={isConnecting()}
                      >
                        {isConnecting() ? t("wallet.connecting") : t("wallet.connect")}
                      </button>
                    </Show>
                  </>
                }
              >
                <p class="mb-4 text-lg">{t("governance.loginRequired")}</p>
                <button
                  class="px-6 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))]/90 disabled:opacity-50"
                  onClick={handleLogin}
                  disabled={isLoggingIn()}
                >
                  {isLoggingIn() ? t("common.checking") : t("governance.loginButton")}
                </button>
              </Show>
            </div>
          }
        >
          {/* Main governance content - logged in */}
          <div class="space-y-6">
            {/* Voting Power Section */}
            <div class="p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
              <h2 class="text-xl font-semibold mb-4">{t("governance.yourVotingPower")}</h2>
              <p class="text-sm text-muted-foreground mb-4">
                {t("governance.votingPowerDescription")}
              </p>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Staking Balance */}
                <div class="p-4 rounded-md bg-[hsl(var(--muted))]">
                  <div class="text-sm text-muted-foreground mb-2">
                    {t("governance.stakingBalance")}
                  </div>
                  <TokenValue
                    amount={stakingBalance()}
                    tokenAddress={stakingTokenAddress()}
                    format="vertical"
                  />
                </div>

                {/* Voting Power */}
                <div class="p-4 rounded-md bg-[hsl(var(--muted))]">
                  <div class="text-sm text-muted-foreground mb-2">
                    {t("governance.votes")}
                  </div>
                  <TokenValue
                    amount={votingPower()}
                    tokenAddress={stakingTokenAddress()}
                    format="vertical"
                  />
                </div>
              </div>

              {/* Delegation Status */}
              <div class="border-t border-[hsl(var(--border))] pt-4">
                <Show
                  when={hasDelegated()}
                  fallback={
                    <div>
                      <p class="text-sm text-muted-foreground mb-3">
                        {t("governance.notDelegated")}
                      </p>
                      <button
                        class="px-4 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))]/90"
                        onClick={() => setShowDelegateModal(true)}
                      >
                        {t("governance.delegateButton")}
                      </button>
                    </div>
                  }
                >
                  <div>
                    <div class="text-sm text-muted-foreground mb-2">
                      {t("governance.delegatedTo")}
                      <Show when={isDelegatedToSelf()}>
                        <span class="ml-1">({t("governance.self")})</span>
                      </Show>
                    </div>

                    <Show when={delegateUser()}>
                      <div class="mb-3">
                        <UserCard author={delegateUser()} />
                      </div>
                    </Show>

                    <button
                      class="px-4 py-2 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]"
                      onClick={() => setShowDelegateModal(true)}
                    >
                      {t("governance.changeDelegate")}
                    </button>
                  </div>
                </Show>
              </div>
            </div>

            {/* Proposals Section */}
            <div class="p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
              <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-semibold">{t("governance.proposals")}</h2>

                <div class="flex items-center gap-3">
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showOnlyActive()}
                      onChange={handleToggleActive}
                      class="w-4 h-4 rounded border-[hsl(var(--input))] text-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]"
                    />
                    <span class="text-sm">{t("governance.showOnlyActive")}</span>
                  </label>

                  <button
                    class="px-4 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))]/90 font-medium"
                    onClick={() => navigate("/governance/create-proposal")}
                  >
                    {t("governance.createProposal")}
                  </button>
                </div>
              </div>

              <Show when={loadingProposals()}>
                <div class="flex justify-center py-8">
                  <Spinner />
                </div>
              </Show>

              <Show when={!loadingProposals() && proposals().length === 0}>
                <p class="text-muted-foreground text-center py-8">
                  {t("governance.noProposals")}
                </p>
              </Show>

              <Show when={!loadingProposals() && proposals().length > 0}>
                <div class="space-y-4">
                  <For each={proposals()}>
                    {(proposal) => (
                      <ProposalCard
                        proposal={proposal}
                        hasDelegated={hasDelegated()}
                        votingPower={votingPower()}
                        onVote={handleVote}
                      />
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        </Show>
      </Show>

      {/* Delegate Modal */}
      <DelegateModal
        isOpen={showDelegateModal()}
        onClose={() => setShowDelegateModal(false)}
        onSuccess={handleDelegationSuccess}
        currentDelegate={delegatedTo()}
      />

    </main>
  );
}
