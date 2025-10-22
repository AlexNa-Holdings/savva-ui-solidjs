// src/x/governance/ProposalCard.jsx
import { Show, createSignal, onMount, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { sendAsActor } from "../../blockchain/npoMulticall.js";
import UserCard from "../ui/UserCard.jsx";
import ProposalActions from "./ProposalActions.jsx";
import ProgressBar from "../ui/ProgressBar.jsx";
import Countdown from "../ui/Countdown.jsx";
import { parseProposalActions } from "./proposalActionsParser.js";

export default function ProposalCard(props) {
  const app = useApp();
  const { t } = app;

  const proposal = () => props.proposal;
  const hasDelegated = () => props.hasDelegated || false;
  const votingPower = () => BigInt(props.votingPower || 0);
  const [proposerUser, setProposerUser] = createSignal(null);
  const [proposalActions, setProposalActions] = createSignal([]);
  const [parsedActionsWithValues, setParsedActionsWithValues] = createSignal([]);
  const [loadingActions, setLoadingActions] = createSignal(false);
  const [currentBlock, setCurrentBlock] = createSignal(0n);
  const [voteData, setVoteData] = createSignal(null);
  const [quorum, setQuorum] = createSignal(0n);
  const [proposalState_blockchain, setProposalState_blockchain] = createSignal(null);
  const [isExecuting, setIsExecuting] = createSignal(false);

  /**
   * Get Config contract address
   */
  const configContractAddress = createMemo(() => {
    return app.info()?.savva_contracts?.Config?.address || "";
  });

  /**
   * Calculate proposal state based on block numbers
   */
  const proposalState = createMemo(() => {
    const voteStart = proposal().vote_start;
    const voteEnd = proposal().vote_end;
    const current = currentBlock();

    if (!voteStart || !voteEnd || !current) {
      return { state: "unknown", label: "Unknown", color: "gray" };
    }

    const startBlock = BigInt(voteStart);
    const endBlock = BigInt(voteEnd);

    if (current < startBlock) {
      return {
        state: "pending",
        label: "Voting Starts Soon",
        color: "blue",
        description: `Voting starts at block ${voteStart}`,
      };
    } else if (current >= startBlock && current <= endBlock) {
      return {
        state: "active",
        label: "Voting Active",
        color: "green",
        description: `Voting ends at block ${voteEnd}`,
      };
    } else {
      return {
        state: "ended",
        label: "Voting Ended",
        color: "gray",
        description: `Voting ended at block ${voteEnd}`,
      };
    }
  });

  /**
   * Calculate countdown target timestamp for active proposals
   * Assumes ~10 second block time for PulseChain
   */
  const countdownTarget = createMemo(() => {
    const state = proposalState();
    if (state.state !== "active") return null;

    const voteEnd = proposal().vote_end;
    const current = currentBlock();
    if (!voteEnd || !current) return null;

    const blocksRemaining = BigInt(voteEnd) - current;
    if (blocksRemaining <= 0n) return null;

    // Estimate: 10 seconds per block
    const secondsRemaining = Number(blocksRemaining) * 10;
    const targetTimestamp = Math.floor(Date.now() / 1000) + secondsRemaining;

    return targetTimestamp;
  });

  /**
   * Calculate vote statistics
   */
  const voteStats = createMemo(() => {
    const votes = voteData();
    if (!votes) return null;

    const forVotes = BigInt(votes.for || 0);
    const againstVotes = BigInt(votes.against || 0);
    const abstainVotes = BigInt(votes.abstain || 0);
    const totalVotes = forVotes + againstVotes + abstainVotes;
    const quorumRequired = quorum();

    // Calculate percentages
    const forPercent = totalVotes > 0n ? Number((forVotes * 10000n) / totalVotes) / 100 : 0;
    const againstPercent = totalVotes > 0n ? Number((againstVotes * 10000n) / totalVotes) / 100 : 0;
    const abstainPercent = totalVotes > 0n ? Number((abstainVotes * 10000n) / totalVotes) / 100 : 0;

    // Calculate quorum progress
    const quorumPercent = quorumRequired > 0n ? Number((totalVotes * 10000n) / quorumRequired) / 100 : 0;
    const quorumReached = totalVotes >= quorumRequired;

    // Determine result
    const isEnded = proposalState().state === "ended";
    let result = "pending";
    let resultLabel = "Pending";
    let resultColor = "gray";

    if (forVotes > againstVotes) {
      result = quorumReached ? "passing" : "failing-quorum";
      resultLabel = quorumReached
        ? (isEnded ? "Passed" : "Leading (For)")
        : (isEnded ? "Failed (Quorum)" : "Leading (No Quorum)");
      resultColor = quorumReached ? "green" : "yellow";
    } else if (againstVotes > forVotes) {
      result = "failing";
      resultLabel = isEnded ? "Rejected" : "Leading (Against)";
      resultColor = "red";
    } else {
      result = "tied";
      resultLabel = "Tied";
      resultColor = "gray";
    }

    return {
      forVotes,
      againstVotes,
      abstainVotes,
      totalVotes,
      forPercent,
      againstPercent,
      abstainPercent,
      quorumRequired,
      quorumPercent,
      quorumReached,
      result,
      resultLabel,
      resultColor,
    };
  });

  /**
   * Check if proposal can be executed
   */
  const canExecute = createMemo(() => {
    const state = proposalState_blockchain();
    const stats = voteStats();

    // State 4 = Succeeded (passed and ready to execute)
    // State 5 = Queued (in timelock, ready to execute after delay)
    return (state === 4 || state === 5) && stats?.result === "passing";
  });

  /**
   * Fetch proposal actions from blockchain
   */
  async function fetchProposalActions() {
    const proposalId = proposal().proposal_id;
    if (!proposalId) return;

    setLoadingActions(true);
    try {
      const { getSavvaContract } = await import("../../blockchain/contracts.js");
      const { createPublicClient } = await import("viem");
      const { configuredHttp } = await import("../../blockchain/contracts.js");

      const governance = await getSavvaContract(app, "Governance", { read: true });

      // Query ProposalCreated event to get the full proposal data
      const chain = app.desiredChain?.();
      if (!chain) {
        console.error("No chain configured");
        return;
      }

      const publicClient = createPublicClient({
        chain,
        transport: configuredHttp(chain.rpcUrls[0])
      });

      const governanceAddress = app.info()?.savva_contracts?.Governance?.address;
      if (!governanceAddress) {
        console.error("Governance contract address not found");
        return;
      }

      // Import Governance ABI
      const GovernanceAbi = (await import("../../blockchain/abi/Governance.json")).default;

      // Query ProposalCreated events with this proposalId
      const logs = await publicClient.getLogs({
        address: governanceAddress,
        event: GovernanceAbi.find(item => item.name === "ProposalCreated"),
        args: {
          proposalId: BigInt(proposalId)
        },
        fromBlock: 0n,
        toBlock: 'latest'
      });

      if (logs && logs.length > 0) {
        const event = logs[0];
        const { targets, values, calldatas } = event.args;

        const actions = targets.map((target, index) => ({
          target,
          value: values[index]?.toString() || "0",
          calldata: calldatas[index],
        }));

        setProposalActions(actions);

        // Parse and enrich actions with current values
        await parseAndEnrichActions(actions);
      } else {
        console.log("No ProposalCreated event found for proposal", proposalId);
      }
    } catch (error) {
      console.error("Failed to fetch proposal actions:", error);
    } finally {
      setLoadingActions(false);
    }
  }

  /**
   * Parse actions and enrich with current parameter values from Config contract
   */
  async function parseAndEnrichActions(actions) {
    if (!actions || !Array.isArray(actions) || actions.length === 0) {
      setParsedActionsWithValues([]);
      return;
    }

    try {
      // First, parse the actions
      const parsed = parseProposalActions(actions, configContractAddress());

      // Then fetch current values
      const { getSavvaContract } = await import("../../blockchain/contracts.js");
      const config = await getSavvaContract(app, "Config", { read: true });

      for (const action of parsed) {
        if (!action.needsCurrentValue) continue;

        try {
          let currentValue;

          if (action.type === "config_uint") {
            currentValue = await config.read.getUInt([action.keyBytes32]);
          } else if (action.type === "config_address") {
            currentValue = await config.read.getAddr([action.keyBytes32]);
          } else if (action.type === "config_string") {
            currentValue = await config.read.get([action.keyBytes32]);
          }

          // Add current value to the action
          action.currentValue = currentValue;

          // Update display details to include both current and new values
          action.display.details.push(
            {
              label: "Current Value",
              value: currentValue,
              format: action.paramMeta?.format || "text",
              tokenSymbol: action.paramMeta?.tokenSymbol,
              isOldValue: true,
            },
            {
              label: "New Value",
              value: action.newValue,
              format: action.paramMeta?.format || "text",
              tokenSymbol: action.paramMeta?.tokenSymbol,
              isNewValue: true,
            }
          );
        } catch (error) {
          console.error(`Failed to fetch current value for ${action.paramName}:`, error);
          // Still show new value even if current value fetch fails
          action.display.details.push({
            label: "New Value",
            value: action.newValue,
            format: action.paramMeta?.format || "text",
            tokenSymbol: action.paramMeta?.tokenSymbol,
            isNewValue: true,
          });
        }
      }

      // Update the signal with enriched actions
      setParsedActionsWithValues(parsed);
    } catch (error) {
      console.error("Failed to parse and enrich actions:", error);
      // Fallback to showing parsed actions without current values
      const parsed = parseProposalActions(actions, configContractAddress());
      setParsedActionsWithValues(parsed);
    }
  }

  /**
   * Fetch current block number
   */
  async function fetchCurrentBlock() {
    try {
      const publicClient = app.publicClient?.();
      if (publicClient) {
        const blockNum = await publicClient.getBlockNumber();
        setCurrentBlock(blockNum);
      } else {
        // Fallback: create a public client
        const { createPublicClient } = await import("viem");
        const { configuredHttp } = await import("../../blockchain/contracts.js");
        const chain = app.desiredChain?.();
        if (chain) {
          const pc = (await import("viem")).createPublicClient({
            chain,
            transport: configuredHttp(chain.rpcUrls[0])
          });
          const blockNum = await pc.getBlockNumber();
          setCurrentBlock(blockNum);
        }
      }
    } catch (error) {
      console.error("Failed to fetch current block number:", error);
    }
  }

  /**
   * Fetch vote data and quorum from governance contract
   */
  async function fetchVoteData() {
    const proposalId = proposal().proposal_id;
    if (!proposalId) return;

    try {
      const { getSavvaContract } = await import("../../blockchain/contracts.js");
      const governance = await getSavvaContract(app, "Governance", { read: true });

      // Fetch proposal votes (againstVotes, forVotes, abstainVotes)
      const votes = await governance.read.proposalVotes([BigInt(proposalId)]);

      // Fetch quorum required
      const snapshotBlock = await governance.read.proposalSnapshot([BigInt(proposalId)]);
      const quorumVotes = await governance.read.quorum([snapshotBlock]);

      // Fetch proposal state from blockchain
      // States: 0=Pending, 1=Active, 2=Canceled, 3=Defeated, 4=Succeeded, 5=Queued, 6=Expired, 7=Executed
      const state = await governance.read.state([BigInt(proposalId)]);

      setVoteData({
        against: votes[0],
        for: votes[1],
        abstain: votes[2],
      });
      setQuorum(quorumVotes);
      setProposalState_blockchain(Number(state));
    } catch (error) {
      console.error("Failed to fetch vote data:", error);
    }
  }

  /**
   * Fetch proposer user info and proposal actions on mount
   */
  onMount(async () => {
    // Fetch current block number
    await fetchCurrentBlock();

    // Fetch vote data and quorum
    await fetchVoteData();

    // Fetch proposer user info
    const proposerAddress = proposal().proposer;
    if (proposerAddress) {
      try {
        const domain = app.selectedDomainName?.() || app.domain?.() || "";
        const user = await app.wsCall?.("get-user", {
          domain,
          user_addr: proposerAddress
        });
        if (user) {
          setProposerUser({ ...user, address: user.address || proposerAddress });
        }
      } catch (error) {
        console.error("Failed to fetch proposer user:", error);
      }
    }

    // Fetch proposal actions
    await fetchProposalActions();
  });

  /**
   * Format proposal ID to short form (0x0000...0000)
   */
  const formatProposalId = (id) => {
    if (!id) return "";
    const idStr = String(id);
    if (idStr.length <= 10) return idStr;
    return `${idStr.slice(0, 6)}...${idStr.slice(-4)}`;
  };

  /**
   * Handle vote click
   */
  const handleVote = (support) => {
    // support: 0 = Against, 1 = For, 2 = Abstain
    props.onVote?.(proposal(), support);
  };

  /**
   * Handle execute proposal
   */
  const handleExecute = async () => {
    const proposalId = proposal().proposal_id;
    if (!proposalId || isExecuting()) return;

    setIsExecuting(true);
    try {
      // Get proposal details for execution
      const actions = proposalActions();
      if (!actions || actions.length === 0) {
        throw new Error("No proposal actions found");
      }

      const targets = actions.map(a => a.target);
      const values = actions.map(a => BigInt(a.value || "0"));
      const calldatas = actions.map(a => a.calldata);
      const descriptionHash = (await import("viem")).keccak256((await import("viem")).toBytes(proposal().description || ""));

      // Execute the proposal using sendAsActor
      await sendAsActor(app, {
        contractName: "Governance",
        functionName: "execute",
        args: [targets, values, calldatas, descriptionHash],
      });

      // Refresh proposal data
      await fetchVoteData();
    } catch (error) {
      console.error("Failed to execute proposal:", error);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div class="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
      <div class="flex items-start gap-4 mb-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-2 mb-1">
            <h3 class="font-semibold text-lg flex-1">
              {proposal().description}
            </h3>
            <Show when={proposal().voted}>
              <span class="text-xs px-2 py-1 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shrink-0">
                {t("governance.voted")}
              </span>
            </Show>
          </div>
          <p class="text-xs text-muted-foreground">
            ID: {formatProposalId(proposal().proposal_id)}
          </p>
        </div>
        <div class="shrink-0 w-48">
          <Show when={proposerUser()} fallback={
            <div class="text-xs text-muted-foreground">
              {proposal().proposer?.slice(0, 6)}...{proposal().proposer?.slice(-4)}
            </div>
          }>
            <UserCard author={proposerUser()} />
          </Show>
        </div>
      </div>

      {/* Proposal State and Block Info */}
      <Show when={proposal().vote_start && proposal().vote_end}>
        <div class="mb-3">
          <div class="flex items-center justify-between gap-2 mb-1">
            <div class="flex items-center gap-2">
              <span
                class={`text-xs px-2 py-1 rounded-md font-medium ${
                  proposalState().color === "green"
                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                    : proposalState().color === "blue"
                    ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                    : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"
                }`}
              >
                {proposalState().label}
              </span>
              <span class="text-xs text-muted-foreground">
                {proposalState().description}
              </span>
            </div>

            <Show when={countdownTarget()}>
              <Countdown targetTs={countdownTarget()} size="sm" labelStyle="short" />
            </Show>
          </div>

          <div class="text-xs text-muted-foreground">
            {t("governance.blocks")}: {proposal().vote_start?.toString()} - {proposal().vote_end?.toString()}
          </div>
        </div>
      </Show>

      {/* Voting Statistics */}
      <Show when={voteStats()}>
        <div class="mb-3 p-3 rounded-md bg-[hsl(var(--card))] border border-[hsl(var(--border))]">
          {/* Result Badge */}
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm font-semibold">{t("governance.votingResults")}</span>
            <span
              class={`text-xs px-2 py-1 rounded-md font-medium ${
                voteStats().resultColor === "green"
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  : voteStats().resultColor === "red"
                  ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                  : voteStats().resultColor === "yellow"
                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                  : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"
              }`}
            >
              {voteStats().resultLabel}
            </span>
          </div>

          {/* Vote Breakdown */}
          <div class="space-y-2 mb-3">
            {/* For Votes */}
            <div>
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="text-green-600 dark:text-green-400 font-medium">{t("governance.voteFor")}</span>
                <span class="font-semibold">{voteStats().forPercent.toFixed(1)}%</span>
              </div>
              <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  class="h-full bg-green-600 dark:bg-green-500 transition-all duration-300"
                  style={{ width: `${voteStats().forPercent}%` }}
                />
              </div>
            </div>

            {/* Against Votes */}
            <div>
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="text-red-600 dark:text-red-400 font-medium">{t("governance.voteAgainst")}</span>
                <span class="font-semibold">{voteStats().againstPercent.toFixed(1)}%</span>
              </div>
              <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  class="h-full bg-red-600 dark:bg-red-500 transition-all duration-300"
                  style={{ width: `${voteStats().againstPercent}%` }}
                />
              </div>
            </div>

            {/* Abstain Votes */}
            <Show when={voteStats().abstainPercent > 0}>
              <div>
                <div class="flex items-center justify-between text-xs mb-1">
                  <span class="text-gray-600 dark:text-gray-400 font-medium">{t("governance.voteAbstain")}</span>
                  <span class="font-semibold">{voteStats().abstainPercent.toFixed(1)}%</span>
                </div>
                <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-gray-500 dark:bg-gray-400 transition-all duration-300"
                    style={{ width: `${voteStats().abstainPercent}%` }}
                  />
                </div>
              </div>
            </Show>
          </div>

          {/* Quorum Progress */}
          <div class="pt-3 border-t border-[hsl(var(--border))]">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-medium">{t("governance.quorum")}</span>
              <Show when={voteStats().quorumReached}>
                <span class="text-xs text-green-600 dark:text-green-400 font-semibold">✓ {t("governance.quorumReached")}</span>
              </Show>
            </div>
            <ProgressBar value={voteStats().quorumPercent} />
          </div>
        </div>
      </Show>

      {/* Proposal Actions */}
      <div class="mb-3">
        <ProposalActions parsedActions={parsedActionsWithValues()} />
      </div>

      <Show when={!proposal().voted && hasDelegated() && votingPower() > 0n && proposalState().state === "active"}>
        <div class="mt-3 pt-3 border-t border-[hsl(var(--border))]">
          <p class="text-sm text-muted-foreground mb-2">{t("governance.castYourVote")}</p>
          <div class="flex gap-2">
            <button
              class="px-3 py-1.5 text-sm rounded-md bg-green-600 text-white hover:bg-green-700"
              onClick={() => handleVote(1)}
            >
              {t("governance.voteFor")}
            </button>
            <button
              class="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700"
              onClick={() => handleVote(0)}
            >
              {t("governance.voteAgainst")}
            </button>
            <button
              class="px-3 py-1.5 text-sm rounded-md bg-gray-600 text-white hover:bg-gray-700"
              onClick={() => handleVote(2)}
            >
              {t("governance.voteAbstain")}
            </button>
          </div>
        </div>
      </Show>

      <Show when={!proposal().voted && hasDelegated() && proposalState().state === "pending"}>
        <div class="mt-3 pt-3 border-t border-[hsl(var(--border))]">
          <p class="text-sm text-muted-foreground">
            {t("governance.votingNotStarted")}
          </p>
        </div>
      </Show>

      <Show when={!proposal().voted && hasDelegated() && proposalState().state === "ended"}>
        <div class="mt-3 pt-3 border-t border-[hsl(var(--border))]">
          <p class="text-sm text-muted-foreground">
            {t("governance.votingEnded")}
          </p>
        </div>
      </Show>

      {/* Execute Button */}
      <Show when={canExecute()}>
        <div class="mt-3 pt-3 border-t border-[hsl(var(--border))]">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-semibold text-green-600 dark:text-green-400">
                {t("governance.readyToExecute")}
              </p>
              <p class="text-xs text-muted-foreground">
                {t("governance.executeDescription")}
              </p>
            </div>
            <button
              class="px-4 py-2 text-sm font-medium rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleExecute}
              disabled={isExecuting()}
            >
              {isExecuting() ? t("governance.executing") : t("governance.executeProposal")}
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
