// src/x/pages/ProfilePage.jsx
import { createMemo, createResource, createSignal, Show, Switch, Match, createEffect, For } from "solid-js";
import { Dynamic } from "solid-js/web";
import { useApp } from "../../context/AppContext.jsx";
import { useHashRouter, navigate } from "../../routing/smartRouter.js";
import ClosePageButton from "../ui/ClosePageButton.jsx";
import Spinner from "../ui/Spinner.jsx";
import IpfsImage from "../ui/IpfsImage.jsx";
import UnknownUserIcon from "../ui/icons/UnknownUserIcon.jsx";
import StakerLevelIcon from "../ui/StakerLevelIcon.jsx";
import VerifiedBadge from "../ui/icons/VerifiedBadge.jsx";
import NpoIcon from "../ui/icons/NpoIcon.jsx";
import Address from "../ui/Address.jsx";
import { ipfs } from "../../ipfs/index.js";
import { PostsIcon, SubscribersIcon, SubscriptionsIcon, WalletIcon, HistoryIcon } from "../ui/icons/ProfileIcons.jsx";
import PostsTab from "../profile/PostsTab.jsx";
import SubscribersTab from "../profile/SubscribersTab.jsx";
import SubscriptionsTab from "../profile/SubscriptionsTab.jsx";
import WalletTab from "../profile/WalletTab.jsx";
import HistoryTab from "../profile/HistoryTab.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import { walletAccount } from "../../blockchain/wallet.js";
import SubscribeModal from "../modals/SubscribeModal.jsx";
import { getSavvaContract, configuredHttp } from "../../blockchain/contracts.js";
import { createPublicClient } from "viem";
import formSocialLink from "../profile/formSocialLink.jsx";

// Data fetcher for the user profile
async function fetchUserProfile({ app, identifier }) {
  if (!identifier || !app.wsCall) return null;
  try {
    const wsParams = { domain: app.selectedDomainName() };
    const currentUser = app.authorizedUser();
    if (currentUser) wsParams.caller = currentUser.address;
    if (identifier.startsWith("@")) wsParams.user_name = identifier.substring(1);
    else wsParams.user_addr = identifier;
    return await app.wsCall("get-user", wsParams);
  } catch (error) {
    console.error("Failed to fetch user profile:", error);
    return { error: error.message };
  }
}

// Minimal fetcher for subscribe-state only (actor → author relationship)
async function fetchSubRelation({ app, domain, actor, author }) {
  if (!app?.wsCall || !domain || !actor || !author) return false;
  try {
    const res = await app.wsCall("get-user", {
      domain,
      user_addr: author,
      caller: actor,
    });
    const n = Number(res?.i_sponsor_for ?? 0);
    return Number.isFinite(n) && n > 0;
  } catch (e) {
    console.warn("fetchSubRelation failed", e);
    return false;
  }
}

// Data fetcher for the profile details from IPFS
async function fetchProfileDetails(cid, app) {
  if (!cid) return null;
  try {
    const { data } = await ipfs.getJSONBest(app, cid);
    return data;
  } catch (e) {
    console.error(`Failed to fetch profile details from IPFS CID: ${cid}`, e);
    return { error: e.message };
  }
}

export default function ProfilePage() {
  const app = useApp();
  const { t } = app;
  const { route } = useHashRouter();

  const identifier = createMemo(() => {
    const path = route();
    return path.split("?")[0].split("/")[1] || "";
  });

  const [userResource, { refetch: refetchUser }] = createResource(
    () => ({ app, identifier: identifier() }),
    fetchUserProfile
  );
  const [profileDetails] = createResource(
    () => userResource()?.profile_cid,
    (cid) => fetchProfileDetails(cid, app)
  );

  const [activeTab, setActiveTab] = createSignal("posts");

  const isBanned = createMemo(() => !!userResource()?.banned);

  // Tabs (hide Wallet when banned)
  const TABS = createMemo(() => {
    const items = [
      { id: "posts", label: t("profile.tabs.posts"), icon: PostsIcon },
      { id: "subscribers", label: t("profile.tabs.subscribers"), icon: SubscribersIcon },
      { id: "subscriptions", label: t("profile.tabs.subscriptions"), icon: SubscriptionsIcon },
      { id: "history", label: t("profile.tabs.history"), icon: HistoryIcon },
    ];
    if (!isBanned()) items.push({ id: "wallet", label: t("profile.tabs.wallet"), icon: WalletIcon });
    return items;
  });

  const activeTabDef = createMemo(() => TABS().find((tab) => tab.id === activeTab()) || TABS()[0]);

  const desiredTab = createMemo(() => {
    const path = route() || "";
    const qs = path.split("?")[1] || "";
    return new URLSearchParams(qs).get("tab") || "";
  });

  createEffect(() => {
    const tab = desiredTab();
    if (!tab) return;
    const valid = TABS().map((t) => t.id);
    if (valid.includes(tab)) setActiveTab(tab);
  });

  createEffect(() => {
    const available = TABS();
    if (!available.some((t) => t.id === activeTab())) setActiveTab("posts");
  });

  const profileLinks = createMemo(() => {
    const details = profileDetails();
    const arr = Array.isArray(details?.links) ? details.links : [];
    return arr
      .map((l) => ({
        title: String(l?.title || "").trim(),
        url: String(l?.url || "").trim(),
      }))
      .filter((x) => x.title || x.url);
  });

  function onTabChange(nextId) {
    const hash = window.location.hash || "";
    const [path, qsRaw] = hash.split("?");
    const params = new URLSearchParams(qsRaw || "");
    params.set("tab", nextId);
    const nextHash = `${path}?${params.toString()}`;
    if (nextHash !== hash) history.replaceState(null, "", nextHash);
    setActiveTab(nextId);
  }

  // Display helpers
  const uiLang = () => (app.lang?.() || "en").toLowerCase();

  const displayName = createMemo(() => {
    const u = userResource();
    if (!u) return "";
    const addr = String(u.address || "").toLowerCase();
    const overlay = app.userDisplayNames?.()?.[addr]?.[uiLang()];
    if (overlay) return overlay;
    const serverNames = u.display_names;
    if (serverNames && typeof serverNames === "object") {
      const n = serverNames[uiLang()];
      if (n) return n;
    }
    return u.display_name || u.name || "";
  });

  const aboutText = createMemo(() => {
    const details = profileDetails();
    if (!details) return "";
    const lang = app.lang();
    if (details.about_me && typeof details.about_me === "object") {
      return details.about_me[lang] || details.about_me.en || Object.values(details.about_me)[0] || "";
    }
    if (details.about && typeof details.about === "string") {
      return details.about;
    }
    return "";
  });

  // Actor/profile context
  const isActorProfile = createMemo(() => {
    const actorAddr = app.actorAddress?.()?.toLowerCase();
    const profileAddr = userResource()?.address?.toLowerCase();
    return !!actorAddr && !!profileAddr && actorAddr === profileAddr;
  });

  const canEdit = createMemo(() => {
    const connectedWallet = walletAccount()?.toLowerCase();
    const authAddr = app.authorizedUser()?.address?.toLowerCase();
    return isActorProfile() && !!connectedWallet && connectedWallet === authAddr;
  });

  const [showSub, setShowSub] = createSignal(false);
  const domainName = createMemo(() => app.selectedDomainName?.() || "");

  // Lightweight subscribe-state that updates on actor change (no full page refetch)
  const [subState, { refetch: refetchSub }] = createResource(
    () => {
      const author = userResource()?.address;
      const actor = app.actorAddress?.();
      const domain = domainName();
      return author && actor && domain ? { app, domain, actor, author } : null;
    },
    fetchSubRelation
  );

  const isSubscribed = createMemo(() => !!subState()); // true/false

  // Actions
  async function handleUnsubscribe(authorAddress) {
    try {
      const clubs = await getSavvaContract(app, "AuthorsClubs", { write: true });
      const hash = await clubs.write.stop([domainName(), authorAddress]);
      const pc = createPublicClient({ chain: app.desiredChain(), transport: configuredHttp(app.desiredChain()?.rpcUrls?.[0]) });
      await pc.waitForTransactionReceipt({ hash });
      await refetchSub();
    } catch (e) {
      console.error("ProfilePage: stop() failed", e);
    }
  }

  function handleSubscribed() {
    setShowSub(false);
    refetchSub();
  }

  const handleEditProfile = () => {
    navigate(`/profile-edit/${identifier()}`);
  };

  return (
    <main class="sv-container p-4 max-w-4xl mx-auto">
      <ClosePageButton />

      <Switch>
        <Match when={userResource.loading}>
          <div class="flex justify-center items-center h-64">
            <Spinner class="w-8 h-8" />
          </div>
        </Match>
        <Match when={userResource.error || userResource()?.error}>
          <div class="p-4 rounded border text-center border-[hsl(var(--destructive))] bg-[hsl(var(--card))]">
            <h3 class="font-semibold text-[hsl(var(--destructive))]">{t("profile.error.title")}</h3>
            <p class="text-sm mt-1">{userResource.error?.message || userResource()?.error}</p>
          </div>
        </Match>
        <Match when={userResource()}>
          {(user) => (
            <div class="space-y-6">
              {/* Banned banner (+ optional admin comment) */}
              <Show when={isBanned()}>
                <div class="p-3 rounded-md border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))] font-semibold">
                  <span>{t("user.banned")}</span>
                  <Show when={String(user().ban_comment || "").trim()}>
                    <span class="opacity-90"> — {user().ban_comment}</span>
                  </Show>
                </div>
              </Show>

              {/* Header */}
              <div class="flex justify-between items-end gap-4">
                <div class="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                  <div class="flex flex-col items-center gap-4 shrink-0">
                    <div class="w-48 h-48 sm:w-56 sm:h-56 rounded-2xl overflow-hidden bg-[hsl(var(--muted))] border-2 border-[hsl(var(--border))]">
                      <Show when={!isBanned()} fallback={<UnknownUserIcon class="w-full h-full text-[hsl(var(--muted-foreground))]" />}>
                        <IpfsImage
                          src={user().avatar}
                          alt={`${user().name} avatar`}
                          class="w-full h-full object-cover"
                          fallback={<UnknownUserIcon class="w-full h-full text-[hsl(var(--muted-foreground))]" />}
                        />
                      </Show>
                    </div>

                    {/* Subscribe/Unsubscribe — hidden on actor's profile and if banned */}
                    <Show when={app.authorizedUser() && !isActorProfile() && !isBanned()}>
                      <Show
                        when={!isSubscribed()}
                        fallback={
                          <button
                            class="w-full px-4 py-2 rounded-md bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]"
                            onClick={() => handleUnsubscribe(user().address)}
                          >
                            {t("profile.unsubscribe")}
                          </button>
                        }
                      >
                        <button
                          class="w-full px-4 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold"
                          onClick={() => setShowSub(true)}
                        >
                          {t("profile.subscribe")}
                        </button>
                      </Show>
                    </Show>
                  </div>

                  <div class="flex-1 w-full text-center sm:text-left space-y-3">
                    <div class="flex flex-col items-center sm:items-start">
                      <Show when={!isBanned()}>
                        <h2 class="text-2xl font-bold">{displayName() || user().name || user().address}</h2>
                        <Show when={user().name}>
                          <div class="flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))]">
                            <span>{String(user().name || "").toUpperCase()}</span>
                            <VerifiedBadge class="w-4 h-4" />
                          </div>
                        </Show>
                      </Show>

                      {/* Always show address */}
                      <div class="mt-1">
                        <Address address={user().address} format="full" />
                      </div>

                      {/* Accounts info — hidden if banned */}
                      <Show when={!isBanned()}>
                        <div class="flex items-center gap-2 mt-2 text-sm">
                          <span class="text-[hsl(var(--muted-foreground))]">{t("profile.stats.staking")}:</span>
                          <TokenValue amount={user().staked} />
                          <StakerLevelIcon staked={user().staked} class="w-5 h-5" />
                        </div>
                        <div class="flex items-center gap-2 mt-1 text-sm">
                          <span class="text-[hsl(var(--muted-foreground))]">
                            {t("profile.stats.paysForSubscriptions")}:
                          </span>
                          <TokenValue amount={user().total_sponsoring} />
                          <span class="text-[hsl(var(--muted-foreground))] text-sm ml-1">{t("profile.stats.perWeek")}</span>
                        </div>
                        <div class="flex items-center gap-2 mt-1 text-sm">
                          <span class="text-[hsl(var(--muted-foreground))]">
                            {t("profile.stats.receivedFromSubscribers")}:
                          </span>
                          <TokenValue amount={user().total_sponsored} />
                          <span class="text-[hsl(var(--muted-foreground))] text-sm ml-1">{t("profile.stats.perWeek")}</span>
                        </div>
                        <Show when={user().is_npo}>
                          <div class="mt-1">
                            <NpoIcon class="w-7 h-7 opacity-95" title={t("npo.short")} aria-label={t("npo.short")} />
                          </div>
                        </Show>
                      </Show>
                    </div>

                    {/* About — hidden if banned */}
                    <Show when={!isBanned() && aboutText()}>
                      <p class="text-sm pt-2 text-[hsl(var(--foreground))]">{aboutText()}</p>
                    </Show>

                    {/* Links — hidden if banned */}
                    <Show when={!isBanned() && profileLinks().length > 0}>
                      <div class="pt-2 flex flex-wrap gap-2">
                        <For each={profileLinks()}>
                          {(lnk) =>
                            formSocialLink(lnk.title || "", lnk.url || "", {
                              class: "inline-flex items-center gap-1.5 underline hover:opacity-80 break-all",
                              iconClass: "w-6 h-6",
                            })
                          }
                        </For>
                      </div>
                    </Show>
                  </div>
                </div>

                <div class="flex-shrink-0">
                  <Show when={canEdit() && !isBanned()}>
                    <button
                      onClick={handleEditProfile}
                      class="px-4 py-2 text-sm rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--accent))]"
                      title={t("profile.edit.title")}
                    >
                      {t("profile.edit.buttonLabel")}
                    </button>
                  </Show>
                </div>
              </div>

              {/* Tabs */}
              <div class="mt-4 md:mt-6 grid gap-4 md:grid-cols-[minmax(0,1fr)]">
                <div class="grid gap-3 md:grid-cols-[14rem_minmax(0,1fr)] items-start">
                  <nav
                    class="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible border border-[hsl(var(--border))] rounded-lg p-2"
                    aria-label={t("profile.tabs.navAria") || "Profile sections"}
                  >
                    <For each={TABS()}>{(tab) => {
                      const isActive = () => tab.id === activeTab();
                      const Icon = tab.icon;
                      return (
                        <button
                          type="button"
                          onClick={() => onTabChange(tab.id)}
                          class={`flex items-center gap-2 px-3 py-2 text-sm rounded-md whitespace-nowrap transition-colors ${isActive()
                              ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                              : "bg-transparent text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
                            }`}
                          aria-pressed={isActive() ? "true" : "false"}
                        >
                          {Icon ? (
                            <span class="flex-shrink-0" aria-hidden="true">
                              <Dynamic component={Icon} class="w-4 h-4" />
                            </span>
                          ) : null}
                          <span class="whitespace-nowrap">{tab.label}</span>
                        </button>
                      );
                    }}</For>
                  </nav>

                  <div class="py-4 px-4 border border-[hsl(var(--border))] rounded-lg min-h-[200px] space-y-4 bg-[hsl(var(--background))]">
                    <div class="flex items-center gap-2 text-lg font-semibold">
                      <Show when={activeTabDef()}>
                        {(tab) => (
                          <>
                            <Show when={tab().icon}>
                              <span class="flex-shrink-0" aria-hidden="true">
                                <Dynamic component={tab().icon} class="w-5 h-5" />
                              </span>
                            </Show>
                            <span>{tab().label}</span>
                          </>
                        )}
                      </Show>
                    </div>
                    <div>
                      <Switch>
                        <Match when={activeTab() === "posts"}>
                          <PostsTab user={user()} />
                        </Match>
                        <Match when={activeTab() === "subscribers"}>
                          <SubscribersTab user={user()} />
                        </Match>
                        <Match when={activeTab() === "subscriptions"}>
                          <SubscriptionsTab user={user()} />
                        </Match>
                        <Match when={activeTab() === "history"}>
                          <HistoryTab user={user()} />
                        </Match>
                        <Match when={activeTab() === "wallet"}>
                          <WalletTab user={user()} onStakedCorrected={refetchUser} />
                        </Match>
                      </Switch>
                    </div>
                  </div>
                </div>
              </div>

              {/* Subscribe modal — hidden if banned */}
              <Show when={!isBanned() && showSub()}>
                <SubscribeModal
                  isOpen={showSub()}
                  domain={domainName()}
                  author={user()}
                  onClose={() => setShowSub(false)}
                  onSubmit={handleSubscribed}
                />
              </Show>
            </div>
          )}
        </Match>
      </Switch>
    </main>
  );
}
