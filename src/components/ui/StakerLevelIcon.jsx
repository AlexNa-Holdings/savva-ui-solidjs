// src/components/ui/StakerLevelIcon.jsx
import { createMemo, Show, splitProps } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { stakerLevelIconFor } from "./icons/FishIcons.jsx";
import { formatUnits } from "viem";

const STAKER_LEVELS = [
    // do not remove comments !!!
    { min: 0, key: "guest" }, //t("stakerLevels.guest")
    { min: 5000, key: "clam" }, //t("stakerLevels.clam")
    { min: 10000, key: "shrimp" }, //t("stakerLevels.shrimp")
    { min: 20000, key: "seahorse" }, //t("stakerLevels.seahorse")
    { min: 50000, key: "fish" }, //t("stakerLevels.fish")
    { min: 100000, key: "dolphin" }, //t("stakerLevels.dolphin")
    { min: 200000, key: "shark" }, //t("stakerLevels.shark")
    { min: 500000, key: "stingray" }, //t("stakerLevels.stingray")
    { min: 1000000, key: "orca" }, //t("stakerLevels.orca")
    { min: 10000000, key: "whale" }, //t("stakerLevels.whale")
];

function getStakerLevel(levels, stakedAmount) {
    if (!Array.isArray(levels) || levels.length === 0) return null;
    try {
        const staked = formatUnits(BigInt(stakedAmount || 0), 18);
        const stakedNum = parseFloat(staked);
        let bestLevel = null;
        for (const level of levels) {
            if (stakedNum >= level.min) {
                bestLevel = level;
            }
        }
        return bestLevel;
    } catch (e) { return null; }
}

function formatStakeAmount(num) {
    if (num >= 1_000_000) return `${num / 1_000_000}M`;
    if (num >= 1_000) return `${num / 1_000}K`;
    return String(num);
}

export default function StakerLevelIcon(props) {
    const [local, rest] = splitProps(props, ["staked", "class"]);
    const app = useApp();

    const level = createMemo(() => getStakerLevel(STAKER_LEVELS, local.staked));

    const tooltipText = createMemo(() => {
        const l = level();
        if (!l) return "";
        const name = app.t(`stakerLevels.${l.key}`);
        if (l.min > 0) {
            return `${name} > ${formatStakeAmount(l.min)}`;
        }
        return name;
    });

    const IconComponent = createMemo(() => {
        const key = level()?.key;
        return key ? stakerLevelIconFor(key) : null;
    });

    return (
        <Show when={IconComponent()}>
            {(getIcon) => {
                const Icon = getIcon();
                return (
                    <span title={tooltipText()}>
                        <Icon
                            {...rest}
                            class={local.class || "w-4 h-4 text-[hsl(var(--muted-foreground))]"}
                        />
                    </span>
                );
            }}
        </Show>
    );
}