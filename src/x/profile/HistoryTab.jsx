// src/x/profile/HistoryTab.jsx
import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { useApp } from "../../context/AppContext.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import UserCard from "../ui/UserCard.jsx";
import { PostsIcon, SubscribersIcon, SubscriptionsIcon, WalletIcon, HistoryIcon } from "../ui/icons/ProfileIcons.jsx";
import { HeartIcon } from "../ui/icons/TabIcons.jsx";
import { toChecksumAddress } from "../../blockchain/utils.js";
import { navigate } from "../../routing/smartRouter.js";

const RANGES = [
  { id: "1m", months: 1, labelKey: "profile.history.range.month" },
  { id: "2m", months: 2, labelKey: "profile.history.range.twoMonths" },
  { id: "3m", months: 3, labelKey: "profile.history.range.threeMonths" },
];

function subtractMonths(date, months) {
  const d = new Date(date);
  const originalDay = d.getDate();

  // Set to first day of month to avoid date rollover issues
  d.setDate(1);
  d.setMonth(d.getMonth() - months);

  // Restore original day, but cap at the last day of the target month
  const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(originalDay, lastDayOfMonth));

  return d;
}

function parseAmount(raw) {
  try {
    if (typeof raw === "bigint") return raw;
    if (typeof raw === "number") return BigInt(Math.floor(raw));
    if (typeof raw === "string") return BigInt(raw);
    if (raw && typeof raw === "object") {
      if (typeof raw.hex === "string") return BigInt(raw.hex);
      if (typeof raw.value === "string") return BigInt(raw.value);
    }
  } catch {}
  return 0n;
}

function HistoryUser(props) {
  const user = () => props.user;
  const hasAddress = () => Boolean(user()?.address);
  const name = () => user()?.display_name || user()?.name || "";
  return (
    <Show when={user()} fallback={<span class="text-[hsl(var(--muted-foreground))]">—</span>}>
      <Show
        when={hasAddress()}
        fallback={
          <div class="flex flex-col text-sm max-w-[170px]">
            <Show
              when={name()}
              fallback={<span class="text-[hsl(var(--muted-foreground))]">—</span>}
            >
              <span class="font-medium text-[hsl(var(--foreground))] leading-tight break-words">{name()}</span>
            </Show>
          </div>
        }
      >
        <div class="max-w-[200px] min-w-0">
          <UserCard
            author={user()}
            compact
            textColorClass="text-[hsl(var(--foreground))]"
            mutedTextColorClass="text-[hsl(var(--muted-foreground))]"
          />
        </div>
      </Show>
    </Show>
  );
}

function iconForContract(contract) {
  switch ((contract || "").toLowerCase()) {
    case "posts":
      return PostsIcon;
    case "subscribers":
      return SubscribersIcon;
    case "subscriptions":
      return SubscriptionsIcon;
    case "wallet":
      return WalletIcon;
    default:
      return HistoryIcon;
  }
}

function safeChecksum(addr) {
  if (!addr) return "";
  try {
    return toChecksumAddress(addr);
  } catch {
    return addr;
  }
}

function getPostTitle(record, lang) {
  // Try locales first
  if (record?.locales) {
    const locales = record.locales;
    // Try current lang, then en, then first available
    const title = locales[lang]?.title || locales.en?.title || Object.values(locales)[0]?.title || "";
    if (title) {
      // Truncate to ~40 chars
      if (title.length > 40) return title.slice(0, 40) + "…";
      return title;
    }
  }
  // Try other possible title fields
  const title = record?.post_title || record?.title || record?.postTitle || "";
  if (title) {
    if (title.length > 40) return title.slice(0, 40) + "…";
    return title;
  }
  return "";
}

function getPostCid(record) {
  return record?.short_cid || record?.savva_cid || "";
}

function getCampaignId(record) {
  // Campaign ID is in the info field for fundraiser contributions
  const info = record?.info;
  if (!info) return null;
  // info might be like "123" or "contribution" with campaign_id field
  // Check if info is a numeric string (campaign ID directly)
  if (/^\d+$/.test(info)) return info;
  // Or check for campaign_id field
  return record?.campaign_id || null;
}

export default function HistoryTab(props) {
  const app = useApp();
  const { t } = app;
  const profileAddressChecksum = createMemo(() => safeChecksum(props.user?.address || ""));
  const profileAddressLc = createMemo(() => profileAddressChecksum().toLowerCase());
  const [selectedRange, setSelectedRange] = createSignal(RANGES[0].id);

  const rangeConfig = createMemo(() => RANGES.find((r) => r.id === selectedRange()) || RANGES[0]);
  const timeFromIso = createMemo(() => subtractMonths(new Date(), rangeConfig().months).toISOString());

  const [records] = createResource(
    () => {
      const domain = app.selectedDomainName?.();
      const userAddr = profileAddressChecksum();
      const timeFrom = timeFromIso();
      if (!domain || !userAddr || !timeFrom) return null;
      return { domain, userAddr, timeFrom };
    },
    async (params) => {
      try {
        const data = await app.wsCall?.("get-hist", {
          domain: params.domain,
          user: params.userAddr,
          time_from: params.timeFrom,
        });
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (Array.isArray(data.records)) return data.records;
        return [];
      } catch (e) {
        console.error("HistoryTab", e);
        throw e;
      }
    }
  );

  const savvaAddress = () => app.info()?.savva_contracts?.SavvaToken?.address || "";
  const stakingAddress = () => app.info()?.savva_contracts?.Staking?.address || "";

  const resolveTokenAddress = (token) => {
    if (!token) return "0";
    const normalized = String(token).toUpperCase();
    if (normalized === "SAVVA") return savvaAddress() || "";
    if (normalized === "SAVVA_VOTES" || normalized === "SAVVA_VOTE") return stakingAddress() || savvaAddress() || "";
    return token;
  };

  return (
    <div class="space-y-4">
      <div class="flex justify-end">
        <label class="flex items-center gap-2 text-sm">
          <span class="text-[hsl(var(--muted-foreground))]">{t("profile.history.range.label")}</span>
          <select
            class="px-3 py-1.5 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
            value={selectedRange()}
            onInput={(e) => setSelectedRange(e.currentTarget.value)}
          >
            <For each={RANGES}>{(range) => (
              <option value={range.id}>{t(range.labelKey)}</option>
            )}</For>
          </select>
        </label>
      </div>

      <Show when={!records.loading && !records.error} fallback={
        <div class="py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
          <Show when={records.error} fallback={t("profile.history.loading")}>
            {t("profile.history.error")}
          </Show>
        </div>
      }>
        <Show when={(records() || []).length > 0} fallback={<div class="py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">{t("profile.history.noData")}</div>}>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="text-xs uppercase text-[hsl(var(--muted-foreground))]">
                <tr class="border-b border-[hsl(var(--border))] text-left">
                  <th class="py-2 pr-4 min-w-[130px]">{t("profile.history.columns.time")}</th>
                  <th class="py-2 pr-4 w-[180px]">{t("profile.history.columns.from")}</th>
                  <th class="py-2 pr-4 w-[180px]">{t("profile.history.columns.to")}</th>
                  <th class="py-2 pr-4 min-w-[180px]">{t("profile.history.columns.description")}</th>
                  <th class="py-2 pr-4 text-right min-w-[110px]">{t("profile.history.columns.credit")}</th>
                  <th class="py-2 pr-2 text-right min-w-[110px]">{t("profile.history.columns.debit")}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[hsl(var(--border))]">
                <For each={records()}>{(record) => {
                  const ts = new Date(record.time_stamp || record.timeStamp || record.timestamp || Date.now());
                  const iconComp = iconForContract(record.contract);
                  const amount = parseAmount(record.amount);
                  const toAddr = safeChecksum(record.to?.address || "").toLowerCase();
                  const fromAddr = safeChecksum(record.from?.address || "").toLowerCase();
                  const isCredit = toAddr && toAddr === profileAddressLc();
                  const isDebit = fromAddr && fromAddr === profileAddressLc();
                  const tokenAddress = resolveTokenAddress(record.token);
                  const contractLabel = record.contract || "—";
                  const typeLabel = record.type || record.info || "—";
                  return (
                    <tr class="align-top">
                      <td class="py-3 pr-4 text-xs text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                        <div>{ts.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</div>
                        <div class="opacity-80">{ts.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</div>
                      </td>
                      <td class="py-3 pr-4 align-top">
                        <HistoryUser user={record.from} />
                      </td>
                      <td class="py-3 pr-4 align-top">
                        <HistoryUser user={record.to} />
                      </td>
                      <td class="py-3 pr-4">
                        <div class="flex gap-2 text-sm">
                          <Dynamic component={iconComp} class="w-4 h-4 text-[hsl(var(--muted-foreground))] mt-[2px]" />
                          <div class="flex flex-col leading-tight">
                            <span class="text-[hsl(var(--foreground))] font-medium">{contractLabel}</span>
                            <span class="text-[hsl(var(--muted-foreground))]">{typeLabel}</span>
                            <Show when={getPostCid(record)}>
                              <button
                                type="button"
                                class="flex items-center gap-1 text-xs hover:underline mt-0.5 text-left"
                                style={{ color: "#FF7100" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/post/${getPostCid(record)}`);
                                }}
                              >
                                <PostsIcon class="w-3 h-3" />
                                <span class="truncate max-w-[150px]">{getPostTitle(record, app.lang()) || t("profile.history.post")}</span>
                              </button>
                            </Show>
                            <Show when={getCampaignId(record)}>
                              <button
                                type="button"
                                class="flex items-center gap-1 text-xs hover:underline mt-0.5 text-left"
                                style={{ color: "#FF7100" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/fr/${getCampaignId(record)}`);
                                }}
                              >
                                <HeartIcon class="w-3 h-3" />
                                <span>{t("profile.history.campaign")} #{getCampaignId(record)}</span>
                              </button>
                            </Show>
                          </div>
                        </div>
                      </td>
                      <td class="py-3 pr-4 text-right">
                        <Show when={isCredit}>
                          <TokenValue amount={amount} tokenAddress={tokenAddress} format="vertical" class="ml-auto" />
                        </Show>
                      </td>
                      <td class="py-3 pr-2 text-right">
                        <Show when={isDebit}>
                          <TokenValue amount={amount} tokenAddress={tokenAddress} format="vertical" class="ml-auto" />
                        </Show>
                      </td>
                    </tr>
                  );
                }}</For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
    </div>
  );
}
