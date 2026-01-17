// src/x/ui/StakerLevelIcon.jsx
import { createMemo, Show, splitProps } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { formatUnits } from "viem";

// Staking levels matching iOS app - sorted ascending by minTokens
const STAKER_LEVELS = [
    { min: 0, key: "guest", emoji: "" },
    { min: 5_000, key: "plankton", emoji: "🦠" },
    { min: 10_000, key: "shrimp", emoji: "🦐" },
    { min: 20_000, key: "crab", emoji: "🦀" },
    { min: 50_000, key: "octopus", emoji: "🐙" },
    { min: 100_000, key: "fish", emoji: "🐟" },
    { min: 200_000, key: "dolphin", emoji: "🐬" },
    { min: 500_000, key: "shark", emoji: "🦈" },
    { min: 1_000_000, key: "whale", emoji: "🐋" },
    { min: 10_000_000, key: "humpback", emoji: "🐳" },
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

    const emoji = createMemo(() => level()?.emoji || "");

    return (
        <Show when={emoji()}>
            <span
                title={tooltipText()}
                class={local.class || "text-base"}
                role="img"
                aria-label={tooltipText()}
                {...rest}
            >
                {emoji()}
            </span>
        </Show>
    );
}