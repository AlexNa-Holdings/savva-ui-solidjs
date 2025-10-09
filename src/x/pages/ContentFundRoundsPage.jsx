// src/x/pages/ContentFundRoundsPage.jsx
import { Show, For, createSignal, onMount, createResource, createMemo, createEffect, on } from "solid-js";
import { createPublicClient, http, keccak256 } from "viem";
import { useApp } from "../../context/AppContext.jsx";
import ClosePageButton from "../ui/ClosePageButton.jsx";
import Spinner from "../ui/Spinner.jsx";
import PostCard from "../post/PostCard.jsx";
import Countdown from "../ui/Countdown.jsx";
import {
    connectWallet,
    walletAccount,
    isWalletAvailable,
    eagerConnect,
} from "../../blockchain/wallet.js";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { pushToast, pushErrorToast } from "../../ui/toast.js";
import RandomOracleAbi from "../../blockchain/abi/RandomOracle.json";

export default function ContentFundRoundsPage() {
    const app = useApp();
    const { t } = app;

    const [walletDetected, setWalletDetected] = createSignal(isWalletAvailable());
    const [isConnecting, setIsConnecting] = createSignal(false);
    const [isMining, setIsMining] = createSignal(false);
    const [miningProgress, setMiningProgress] = createSignal(0);
    const [refreshKey, setRefreshKey] = createSignal(0);
    const [rounds, setRounds] = createSignal([]);
    const [loadingRounds, setLoadingRounds] = createSignal(false);
    const [isProcessing, setIsProcessing] = createSignal(false);

    // Random Oracle data source
    const oracleSource = createMemo(() => {
        const info = app.info();
        const oracleAddr = info?.savva_contracts?.RandomOracle?.address;
        if (!oracleAddr) return null;
        return `${oracleAddr}|${refreshKey()}`;
    });

    const [oracleData] = createResource(oracleSource, async () => {
        try {
            const contract = await getSavvaContract(app, "RandomOracle");
            const [entropy, lastUpdateTime, difficulty, numberOfPreviousBlocks] = await Promise.all([
                contract.read.entropy(),
                contract.read.lastUpdateTime(),
                contract.read.difficulty(),
                contract.read.numberOfPreviousBlocks(),
            ]);
            return { entropy, lastUpdateTime, difficulty, numberOfPreviousBlocks };
        } catch (error) {
            console.error("Failed to load RandomOracle data:", error);
            throw error;
        }
    });

    const oracleInfo = createMemo(() => oracleData() || {
        entropy: 0n,
        lastUpdateTime: 0n,
        difficulty: 0n,
        numberOfPreviousBlocks: 0n,
    });

    // Check if we can process rounds
    const canProcessRounds = createMemo(() => {
        const roundsList = rounds();
        if (roundsList.length === 0) return false;

        const firstRound = roundsList[0];
        const nowSeconds = Math.floor(Date.now() / 1000);
        const firstRoundTime = Number(firstRound.roundTime);

        // 1. First round must be finished (round time is in the past)
        const isFirstRoundFinished = firstRoundTime <= nowSeconds;

        // 2. Last update time in oracle must be more than first round time
        const lastUpdateTime = Number(oracleInfo().lastUpdateTime);
        const isOracleUpdatedAfterRound = lastUpdateTime > firstRoundTime;

        return isFirstRoundFinished && isOracleUpdatedAfterRound;
    });

    onMount(() => {
        const available = isWalletAvailable();
        setWalletDetected(available);
        if (available) {
            eagerConnect().catch(() => {});
        }
        fetchUpcomingRounds();
    });

    createEffect(on(() => app.info()?.savva_contracts?.RandomOracle?.address, () => {
        setRefreshKey((value) => value + 1);
    }, { defer: true }));

    const handleConnect = async () => {
        setIsConnecting(true);
        try {
            await connectWallet();
        } finally {
            setIsConnecting(false);
        }
    };

    const handleRefresh = () => setRefreshKey((value) => value + 1);

    const fetchUpcomingRounds = async () => {
        setLoadingRounds(true);
        try {
            const contract = await getSavvaContract(app, "ContentFund");
            const slRoot = await contract.read.SLRoot();

            if (slRoot === 0n) {
                setRounds([]);
                return;
            }

            const maxRounds = 10;
            const roundsList = [];
            let currentId = slRoot;

            for (let i = 0; i < maxRounds && currentId !== 0n; i++) {
                const fund = await contract.read.getFund([currentId]);

                if (fund && fund.author !== '0x0000000000000000000000000000000000000000') {
                    const roundData = {
                        id: currentId,
                        author: fund.author,
                        domain: fund.domain,
                        guid: fund.guid,
                        amount: fund.amount,
                        totalContributed: fund.total_contributed,
                        roundTime: fund.round_time,
                        contributionsCount: fund.contributions?.length || 0,
                        postData: null,
                        userData: null
                    };

                    // Calculate savva_cid using keccak256(abi.encodePacked(author, domain, guid))
                    const authorHex = fund.author.toLowerCase().slice(2).padStart(40, '0');
                    const domainHex = Array.from(new TextEncoder().encode(fund.domain))
                        .map(b => b.toString(16).padStart(2, '0'))
                        .join('');
                    const guidHex = Array.from(new TextEncoder().encode(fund.guid))
                        .map(b => b.toString(16).padStart(2, '0'))
                        .join('');
                    const packed = `0x${authorHex}${domainHex}${guidHex}`;
                    const savvaCid = BigInt(keccak256(packed));

                    // Fetch post data via WS using savva_cid (in hex format)
                    try {
                        const contentListMethod = app.wsMethod?.("content-list");
                        if (contentListMethod) {
                            const savvaCidHex = `0x${savvaCid.toString(16)}`;
                            const postResult = await contentListMethod({
                                id: 0,
                                savva_cid: savvaCidHex,
                                limit: 1
                            });
                            console.log("Post result for", fund.domain, fund.guid, "savva_cid:", savvaCidHex, "result:", postResult);
                            if (postResult?.list?.[0]) {
                                roundData.postData = postResult.list[0];
                                console.log("Set postData:", roundData.postData);
                            } else {
                                console.log("No post found for savva_cid:", savvaCidHex);
                            }
                        }
                    } catch (err) {
                        console.error("Failed to fetch post data:", err);
                    }

                    // Fetch user data via WS using get-user
                    try {
                        const getUserMethod = app.wsMethod?.("get-user");
                        if (getUserMethod) {
                            const userResult = await getUserMethod({
                                domain: fund.domain,
                                user_addr: fund.author
                            });
                            if (userResult) {
                                roundData.userData = { address: fund.author, ...userResult };
                            }
                        }
                    } catch (err) {
                        console.error("Failed to fetch user data:", err);
                    }

                    roundsList.push(roundData);
                }

                currentId = fund.SLRight;
            }

            console.log("Final rounds list:", roundsList);
            setRounds(roundsList);
        } catch (error) {
            console.error("Failed to fetch rounds:", error);
            setRounds([]);
        } finally {
            setLoadingRounds(false);
        }
    };

    const handleMineEntropy = async () => {
        if (!walletAccount()) {
            await handleConnect();
            if (!walletAccount()) return;
        }

        try {
            await app.ensureWalletOnDesiredChain?.();
        } catch (err) {
            pushErrorToast(err, { context: t("contentFundRounds.randomOracle.mineError") });
            return;
        }

        const chain = app.desiredChain?.();
        if (!chain?.rpcUrls?.[0]) {
            pushToast({ type: "error", message: t("contentFundRounds.randomOracle.mineError") });
            return;
        }

        setIsMining(true);
        setMiningProgress(0);
        const pendingToastId = pushToast({
            type: "info",
            message: t("contentFundRounds.randomOracle.mining"),
            autohideMs: 0
        });

        try {
            const publicClient = createPublicClient({
                chain,
                transport: http(chain.rpcUrls[0])
            });

            // Get contract data
            const contract = await getSavvaContract(app, "RandomOracle");
            const [currentEntropy, difficulty, numberOfPreviousBlocks] = await Promise.all([
                contract.read.entropy(),
                contract.read.difficulty(),
                contract.read.numberOfPreviousBlocks(),
            ]);

            console.log("Mining with difficulty:", difficulty.toString());
            console.log("Current entropy:", currentEntropy.toString());

            // Important: We need to test against blocks that will be valid when the TX is mined
            // The contract will check block.number - i, so we should test the same blocks
            // However, since blocks advance, we should keep refetching to stay current

            let blocks = [];
            const refreshBlocks = async () => {
                const currentBlockNumber = await publicClient.getBlockNumber();
                blocks = [];
                for (let i = 1; i <= Number(numberOfPreviousBlocks); i++) {
                    if (i > currentBlockNumber) break;
                    const targetBlock = currentBlockNumber - BigInt(i);
                    const block = await publicClient.getBlock({ blockNumber: targetBlock });
                    if (block && block.hash) {
                        blocks.push(block);
                    }
                }
                console.log(`Fetched ${blocks.length} blocks, current block: ${currentBlockNumber}`);
                return currentBlockNumber;
            };

            await refreshBlocks();

            // Mine off-chain first to find a valid nonce
            let nonce = BigInt(Math.floor(Math.random() * 1000000));
            let found = false;
            const maxAttempts = 100000;

            // Pre-calculate entropy hex (it doesn't change)
            const entropyHex = currentEntropy.toString(16).padStart(64, '0');
            const shift = Number(difficulty);
            const mask = (1n << BigInt(shift)) - 1n;

            for (let attempt = 0; attempt < maxAttempts && !found; attempt++) {
                // Update progress every 10 attempts for more responsive UI
                if (attempt % 10 === 0) {
                    setMiningProgress(attempt);
                }

                // Refresh blocks every 500 attempts to stay current
                if (attempt % 500 === 0 && attempt > 0) {
                    await refreshBlocks();
                }

                const nonceHex = nonce.toString(16).padStart(64, '0');

                // Try this nonce against recent blocks
                for (const block of blocks) {
                    // Calculate hash exactly as Solidity does: keccak256(abi.encodePacked(entropy, blockHash, nonce))
                    // encodePacked concatenates values directly without padding
                    const blockHashHex = block.hash.slice(2); // Remove 0x prefix
                    const packed = `0x${entropyHex}${blockHashHex}${nonceHex}`;

                    const hash = keccak256(packed);
                    const hashBigInt = BigInt(hash);

                    // Check if hash meets difficulty (has 'difficulty' number of trailing zero BITS, not nibbles)
                    if ((hashBigInt & mask) === 0n) {
                        console.log(`Found valid nonce: ${nonce} after ${attempt} attempts`);
                        console.log(`Hash: ${hash}`);
                        console.log(`Block used: ${block.number} (${block.hash})`);
                        setMiningProgress(attempt); // Update one final time with exact count
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    nonce += 1n;
                }

                // Log progress every 1000 attempts
                if (attempt > 0 && attempt % 1000 === 0) {
                    console.log(`Mining... ${attempt} attempts so far`);
                }
            }

            if (!found) {
                throw new Error("Failed to find valid nonce after maximum attempts");
            }

            // Submit the valid nonce to the contract
            const writeContract = await getSavvaContract(app, "RandomOracle", { write: true });
            console.log(`Submitting nonce ${nonce} to contract...`);

            const hash = await writeContract.write.setEntropy([nonce]);
            console.log(`Transaction hash: ${hash}`);

            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            console.log(`Transaction receipt:`, receipt);

            if (receipt.status === 'reverted') {
                throw new Error(`Transaction reverted. Check console for details.`);
            }

            pushToast({
                type: "success",
                message: t("contentFundRounds.randomOracle.mineSuccess")
            });
            handleRefresh();
        } catch (err) {
            console.error("Mining error:", err);

            // Try to extract revert reason
            let errorMessage = t("contentFundRounds.randomOracle.mineError");
            if (err.message) {
                // Check if it's a contract revert
                if (err.message.includes("Nonce does not meet difficulty")) {
                    errorMessage = "Nonce validation failed on-chain. The mined nonce was rejected by the contract.";
                } else if (err.message.includes("revert")) {
                    errorMessage = `Contract reverted: ${err.message}`;
                } else {
                    errorMessage = err.message;
                }
            }

            pushToast({
                type: "error",
                message: errorMessage,
                autohideMs: 10000
            });
        } finally {
            app.dismissToast?.(pendingToastId);
            setIsMining(false);
        }
    };

    const formatTimestamp = (timestamp) => {
        if (!timestamp || timestamp === 0n) return t("common.never");
        const date = new Date(Number(timestamp) * 1000);
        return date.toLocaleString();
    };

    const formatHex = (value) => {
        if (!value) return "0x0";
        return `0x${value.toString(16)}`;
    };

    const handleProcessRounds = async () => {
        if (!walletAccount()) {
            await handleConnect();
            if (!walletAccount()) return;
        }

        try {
            await app.ensureWalletOnDesiredChain?.();
        } catch (err) {
            pushErrorToast(err, { context: t("contentFundRounds.upcomingRounds.processError") });
            return;
        }

        const chain = app.desiredChain?.();
        if (!chain?.rpcUrls?.[0]) {
            pushToast({ type: "error", message: t("contentFundRounds.upcomingRounds.processError") });
            return;
        }

        setIsProcessing(true);
        const pendingToastId = pushToast({
            type: "info",
            message: t("contentFundRounds.upcomingRounds.processing"),
            autohideMs: 0
        });

        try {
            const publicClient = createPublicClient({
                chain,
                transport: http(chain.rpcUrls[0])
            });

            const writeContract = await getSavvaContract(app, "ContentFund", { write: true });
            console.log("Calling processRounds with max_rounds = 10");

            const hash = await writeContract.write.processRounds([10n]);
            console.log(`Transaction hash: ${hash}`);

            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            console.log(`Transaction receipt:`, receipt);

            if (receipt.status === 'reverted') {
                throw new Error(`Transaction reverted. Check console for details.`);
            }

            pushToast({
                type: "success",
                message: t("contentFundRounds.upcomingRounds.processSuccess")
            });

            // Refresh both rounds and oracle data
            fetchUpcomingRounds();
            handleRefresh();
        } catch (err) {
            console.error("Process rounds error:", err);

            let errorMessage = t("contentFundRounds.upcomingRounds.processError");
            if (err.message) {
                if (err.message.includes("revert")) {
                    errorMessage = `Contract reverted: ${err.message}`;
                } else {
                    errorMessage = err.message;
                }
            }

            pushToast({
                type: "error",
                message: errorMessage,
                autohideMs: 10000
            });
        } finally {
            app.dismissToast?.(pendingToastId);
            setIsProcessing(false);
        }
    };

    return (
        <main class="p-4 max-w-6xl mx-auto space-y-4">
            <ClosePageButton />
            <div class="flex items-center justify-between">
                <h2 class="text-2xl font-semibold">{t("contentFundRounds.title")}</h2>
            </div>

            <Show
                when={walletDetected()}
                fallback={
                    <section class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-center p-6 space-y-3">
                        <h2 class="text-lg font-semibold text-[hsl(var(--card-foreground))]">
                            {t("wallet.installTitle")}
                        </h2>
                        <p class="text-sm text-[hsl(var(--muted-foreground))]">
                            {t("wallet.installDescription")}
                        </p>
                    </section>
                }
            >
                <Show
                    when={walletAccount()}
                    fallback={
                        <section class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-center p-6 space-y-3">
                            <h2 class="text-lg font-semibold text-[hsl(var(--card-foreground))]">
                                {t("contentFundRounds.connectWallet")}
                            </h2>
                            <p class="text-sm text-[hsl(var(--muted-foreground))]">
                                {t("contentFundRounds.connectWalletDescription")}
                            </p>
                            <button
                                type="button"
                                class="px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={handleConnect}
                                disabled={isConnecting()}
                            >
                                {isConnecting() ? t("common.working") : t("wallet.connect")}
                            </button>
                        </section>
                    }
                >
                    {/* Random Oracle Section */}
                    <Show
                        when={app.info()?.savva_contracts?.RandomOracle?.address}
                        fallback={
                            <section class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 space-y-3 text-center">
                                <h3 class="text-xl font-semibold text-[hsl(var(--card-foreground))]">
                                    {t("contentFundRounds.randomOracle.title")}
                                </h3>
                                <p class="text-sm text-[hsl(var(--muted-foreground))]">
                                    {t("contentFundRounds.randomOracle.notConfigured")}
                                </p>
                            </section>
                        }
                    >
                        <section class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 space-y-6">
                            <div class="flex items-center justify-between">
                                <h3 class="text-xl font-semibold text-[hsl(var(--card-foreground))]">
                                    {t("contentFundRounds.randomOracle.title")}
                                </h3>
                                <button
                                    type="button"
                                    class="px-3 py-1.5 text-sm rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
                                    onClick={handleRefresh}
                                    disabled={oracleData.loading}
                                >
                                    {t("common.refresh")}
                                </button>
                            </div>

                            <Show when={oracleData.loading}>
                                <div class="flex items-center justify-center py-6">
                                    <Spinner class="w-6 h-6" />
                                </div>
                            </Show>

                            <Show when={oracleData.error}>
                                <div class="space-y-3 text-center">
                                    <p class="text-sm text-[hsl(var(--destructive))]">
                                        {t("contentFundRounds.randomOracle.loadError")}
                                    </p>
                                    <p class="text-xs text-[hsl(var(--muted-foreground))]">
                                        {t("contentFundRounds.randomOracle.contractError")}
                                    </p>
                                    <button
                                        type="button"
                                        class="px-3 py-1.5 text-sm rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
                                        onClick={handleRefresh}
                                    >
                                        {t("common.retry")}
                                    </button>
                                </div>
                            </Show>

                            <Show when={!oracleData.loading && !oracleData.error}>
                                <div class="space-y-4">
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div class="space-y-2">
                                            <div class="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                                                {t("contentFundRounds.randomOracle.entropy")}
                                            </div>
                                            <div class="text-sm font-mono break-all text-[hsl(var(--card-foreground))]">
                                                {formatHex(oracleInfo().entropy)}
                                            </div>
                                        </div>
                                        <div class="space-y-2">
                                            <div class="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                                                {t("contentFundRounds.randomOracle.lastUpdateTime")}
                                            </div>
                                            <div class="text-sm text-[hsl(var(--card-foreground))]">
                                                {formatTimestamp(oracleInfo().lastUpdateTime)}
                                            </div>
                                        </div>
                                        <div class="space-y-2">
                                            <div class="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                                                {t("contentFundRounds.randomOracle.difficulty")}
                                            </div>
                                            <div class="text-sm text-[hsl(var(--card-foreground))]">
                                                {oracleInfo().difficulty.toString()}
                                            </div>
                                        </div>
                                        <div class="space-y-2">
                                            <div class="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                                                {t("contentFundRounds.randomOracle.blocks")}
                                            </div>
                                            <div class="text-sm text-[hsl(var(--card-foreground))]">
                                                {oracleInfo().numberOfPreviousBlocks.toString()}
                                            </div>
                                        </div>
                                    </div>

                                    <div class="pt-4 border-t border-[hsl(var(--border))]">
                                        <button
                                            type="button"
                                            class="w-full px-4 py-3 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                                            onClick={handleMineEntropy}
                                            disabled={isMining()}
                                        >
                                            {isMining()
                                                ? `${t("contentFundRounds.randomOracle.mining")} (${miningProgress()} hashes)`
                                                : t("contentFundRounds.randomOracle.mineButton")
                                            }
                                        </button>
                                        <p class="mt-2 text-xs text-center text-[hsl(var(--muted-foreground))]">
                                            {t("contentFundRounds.randomOracle.mineDescription")}
                                        </p>
                                    </div>
                                </div>
                            </Show>
                        </section>
                    </Show>

                    {/* Upcoming Rounds Section */}
                    <section class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 space-y-6">
                        <div class="flex items-center justify-between">
                            <h3 class="text-xl font-semibold text-[hsl(var(--card-foreground))]">
                                {t("contentFundRounds.upcomingRounds.title")}
                            </h3>
                            <div class="flex items-center gap-2">
                                <button
                                    type="button"
                                    class="px-3 py-1.5 text-sm rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                                    onClick={handleProcessRounds}
                                    disabled={!canProcessRounds() || isProcessing()}
                                >
                                    {isProcessing() ? t("common.working") : t("contentFundRounds.upcomingRounds.processButton")}
                                </button>
                                <button
                                    type="button"
                                    class="px-3 py-1.5 text-sm rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
                                    onClick={fetchUpcomingRounds}
                                    disabled={loadingRounds()}
                                >
                                    {t("common.refresh")}
                                </button>
                            </div>
                        </div>

                        <div class="text-sm text-[hsl(var(--muted-foreground))]">
                            {t("contentFundRounds.upcomingRounds.description")}
                        </div>

                        <Show when={loadingRounds()}>
                            <div class="flex items-center justify-center py-6">
                                <Spinner class="w-6 h-6" />
                            </div>
                        </Show>

                        <Show when={!loadingRounds()}>
                            <div class="rounded-lg border border-[hsl(var(--border))] overflow-hidden">
                                <div class="overflow-x-auto">
                                    <table class="min-w-full text-sm">
                                        <thead class="bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
                                            <tr>
                                                <th class="px-3 py-2 text-left w-32">{t("contentFundRounds.upcomingRounds.domain")}</th>
                                                <th class="px-3 py-2 text-left">{t("contentFundRounds.upcomingRounds.content")}</th>
                                                <th class="px-3 py-2 text-left w-64">{t("contentFundRounds.upcomingRounds.roundTime")}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <Show
                                                when={rounds().length > 0}
                                                fallback={
                                                    <tr>
                                                        <td colspan="3" class="px-3 py-6 text-center text-[hsl(var(--muted-foreground))]">
                                                            {t("contentFundRounds.upcomingRounds.noRounds")}
                                                        </td>
                                                    </tr>
                                                }
                                            >
                                                <For each={rounds()}>
                                                    {(round) => {
                                                        const roundTimeSeconds = Number(round.roundTime);
                                                        const nowSeconds = Math.floor(Date.now() / 1000);
                                                        const isFuture = roundTimeSeconds > nowSeconds;

                                                        return (
                                                            <tr class="border-t border-[hsl(var(--border))]">
                                                                <td class="px-3 py-2">
                                                                    <div class="text-sm font-medium">{round.domain}</div>
                                                                </td>
                                                                <td class="px-3 py-2">
                                                                    <Show
                                                                        when={round.postData}
                                                                        fallback={
                                                                            <div class="text-xs text-[hsl(var(--muted-foreground))] truncate max-w-[200px]">{round.guid}</div>
                                                                        }
                                                                    >
                                                                        <PostCard
                                                                            item={{ _raw: round.postData }}
                                                                            mode="list"
                                                                            compact={true}
                                                                        />
                                                                    </Show>
                                                                </td>
                                                                <td class="px-3 py-2">
                                                                    <Show
                                                                        when={isFuture}
                                                                        fallback={
                                                                            <div class="text-sm font-semibold text-[hsl(var(--muted-foreground))]">FINISHED</div>
                                                                        }
                                                                    >
                                                                        <Countdown
                                                                            targetTs={roundTimeSeconds}
                                                                            size="sm"
                                                                            labelPosition="top"
                                                                            labelStyle="short"
                                                                        />
                                                                    </Show>
                                                                </td>
                                                            </tr>
                                                        );
                                                    }}
                                                </For>
                                            </Show>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </Show>
                    </section>
                </Show>
            </Show>
        </main>
    );
}
