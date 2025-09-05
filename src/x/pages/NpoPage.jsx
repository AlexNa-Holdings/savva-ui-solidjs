// src/x/pages/NpoPage.jsx
import { Show, For, createMemo, createSignal, onMount } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { useHashRouter, navigate } from "../../routing/hashRouter.js";
import ClosePageButton from "../ui/ClosePageButton.jsx";
import Spinner from "../ui/Spinner.jsx";
import UserCard from "../ui/UserCard.jsx";
import Tabs from "../ui/Tabs.jsx";
import { connectWallet, walletAccount, isWalletAvailable } from "../../blockchain/wallet.js";
import { createPublicClient, http, getContract } from "viem";
import SavvaNPOAbi from "../../blockchain/abi/SavvaNPO.json";
import AddMemberModal from "../modals/AddMemberModal.jsx";

function Badge({ ok, t }) {
  return (
    <span
      class="inline-flex items-center justify-center w-6 h-6 rounded border text-xs"
      classList={{
        "bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] border-[hsl(var(--secondary))]": ok,
        "text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]": !ok,
      }}
      title={ok ? t("common.yes") : t("common.no")}
    >
      {ok ? "✓" : "—"}
    </span>
  );
}

// bytes32 -> label
function bytes32ToString(hex) {
  if (!hex || typeof hex !== "string" || !hex.startsWith("0x")) return "";
  try {
    const bytes = new Uint8Array((hex.length - 2) / 2);
    for (let i = 2, j = 0; i < hex.length; i += 2, j++) bytes[j] = parseInt(hex.slice(i, i + 2), 16);
    let end = bytes.length; while (end > 0 && bytes[end - 1] === 0) end--;
    const dec = new TextDecoder().decode(bytes.subarray(0, end));
    return dec && /\S/.test(dec) ? dec : "";
  } catch { return ""; }
}

function normalizeMemberStruct(s) {
  if (!s) return { account: undefined, confirmed: false, lastWeekChecked: 0n };
  if (Array.isArray(s)) return { account: s[0], confirmed: !!s[1], lastWeekChecked: s[2] ?? 0n };
  return { account: s.account, confirmed: !!s.confirmed, lastWeekChecked: s.lastWeekChecked ?? 0n };
}

export default function NpoPage() {
  const app = useApp();
  const { t } = app;
  const { route } = useHashRouter();

  const identifier = createMemo(() => {
    const path = String(route() || "");
    const after = path.slice("/npo/".length);
    return after.split(/[?#]/, 1)[0] || "";
  });

  const [busy, setBusy] = createSignal(true);
  const [needWallet, setNeedWallet] = createSignal(false);

  const [npoUser, setNpoUser] = createSignal(null);
  const [npoAddr, setNpoAddr] = createSignal("");

  const [activeTab, setActiveTab] = createSignal("users");
  const TABS = createMemo(() => ([
    { id: "users",  label: t("npo.page.tabs.users") },
    { id: "tokens", label: t("npo.page.tabs.tokens") },
  ]));

  const [members, setMembers] = createSignal([]);
  const [membersLoading, setMembersLoading] = createSignal(false);
  const [selfIsAdmin, setSelfIsAdmin] = createSignal(false);
  const [publicClient, setPublicClient] = createSignal(null);

  const [showAdd, setShowAdd] = createSignal(false);

  async function ensureWallet() {
    if (walletAccount()) return true;
    if (!isWalletAvailable()) return false;
    setNeedWallet(true);
    try {
      await connectWallet();
      setNeedWallet(false);
      return !!walletAccount();
    } catch {
      return false;
    }
  }

  async function fetchNpoCore(id) {
    const wsParams = { domain: app.selectedDomainName() };
    const me = app.authorizedUser?.();
    if (me?.address) wsParams.caller = me.address;

    if (id.startsWith("@")) wsParams.user_name = id.slice(1);
    else wsParams.user_addr = id;

    const data = await app.wsCall?.("get-user", wsParams);
    if (!data) return null;

    if (!id.startsWith("@") && data.name) {
      navigate(`/npo/@${encodeURIComponent(data.name)}`, { replace: true });
    }

    const address = String(data.address || (!id.startsWith("@") ? id : "") || "");
    return { user: { ...data, address }, address };
  }

  function makePublicClient() {
    const chain = app.desiredChain?.();
    return createPublicClient({
      chain,
      transport: http(chain?.rpcUrls?.[0] ?? undefined),
    });
  }

  async function fetchSelfAdmin(addr, client) {
    const me = app.authorizedUser?.()?.address;
    if (!me) return false;
    try {
      const c = getContract({ address: addr, abi: SavvaNPOAbi, client });
      const yes = await c.read.isAdmin([me]);
      setSelfIsAdmin(!!yes);
      return !!yes;
    } catch {
      setSelfIsAdmin(false);
      return false;
    }
  }

  async function fetchMembersList(addr, client) {
    if (!addr || !client) return [];
    try {
      setMembersLoading(true);
      const c = getContract({ address: addr, abi: SavvaNPOAbi, client });

      const list = await c.read.getMemberList();
      const structs = await Promise.all(list.map((m) => c.read.members([m]).catch(() => null)));
      const admins = await Promise.all(list.map((m) => c.read.isAdmin([m]).catch(() => false)));
      const rolesRaw = await Promise.all(list.map((m) => c.read.getMemberRoles([m]).catch(() => [])));

      const rows = list.map((memberAddr, i) => {
        const nm = normalizeMemberStruct(structs[i]);
        const roleNames = (rolesRaw[i] || []).map((r) => bytes32ToString(r)).filter(Boolean);
        return {
          address: memberAddr,
          confirmed: nm.confirmed,
          lastWeekChecked: nm.lastWeekChecked,
          isAdmin: !!admins[i],
          roles: roleNames,
        };
      });

      const wsBase = { domain: app.selectedDomainName() };
      const me = app.authorizedUser?.();
      if (me?.address) wsBase.caller = me.address;

      const enriched = await Promise.all(
        rows.map(async (row) => {
          try {
            const user = await app.wsCall?.("get-user", { ...wsBase, user_addr: row.address });
            return { ...row, user: { ...(user || {}), address: row.address } };
          } catch {
            return { ...row, user: { address: row.address } };
          }
        })
      );

      return enriched;
    } finally {
      setMembersLoading(false);
    }
  }

  onMount(async () => {
    try {
      await ensureWallet();

      const id = identifier();
      const core = await fetchNpoCore(id);
      if (!core) return;
      setNpoUser(core.user);
      setNpoAddr(core.address);

      const pc = makePublicClient();
      setPublicClient(pc);

      await fetchSelfAdmin(core.address, pc);
      const rows = await fetchMembersList(core.address, pc);
      setMembers(rows);
    } finally {
      setBusy(false);
    }
  });

  async function refreshMembers() {
    if (!npoAddr() || !publicClient()) return;
    const rows = await fetchMembersList(npoAddr(), publicClient());
    setMembers(rows);
  }

  return (
    <div class="mx-auto w-full max-w-[860px] px-3">
      <div class="flex items-center justify-between gap-3 mb-3">
        <h1 class="text-xl font-semibold">{t("npo.page.title")}</h1>
        <ClosePageButton />
      </div>

      <Show when={!busy()} fallback={<div class="py-12 flex justify-center"><Spinner /></div>}>
        <Show when={needWallet() && !walletAccount()}>
          <div class="rounded-lg border border-[hsl(var(--border))] p-4 bg-[hsl(var(--card))] mb-4">
            <p class="mb-3">{t("wallet.connectPrompt")}</p>
            <Show when={isWalletAvailable()}>
              <button
                class="px-3 py-1.5 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
                onClick={async () => { setBusy(true); await ensureWallet(); setBusy(false); }}
              >
                {t("wallet.connect")}
              </button>
            </Show>
          </div>
        </Show>

        <Show when={npoUser()}>
          <div class="rounded-lg border border-[hsl(var(--border))] p-3 bg-[hsl(var(--card))] mb-4">
            <UserCard author={npoUser()} />
          </div>
        </Show>

        <Tabs items={TABS()} value={activeTab()} onChange={setActiveTab} compactWidth={720} />
        <div class="tabs_panel rounded-b-lg border border-t-0 border-[hsl(var(--border))]">
          <Show when={activeTab() === "users"}>
            {/* Toolbar above the table */}
            <div class="flex items-center justify-between px-3 py-2 border-b border-[hsl(var(--border))]">
              <div class="text-sm opacity-80">{t("npo.page.members.title")}</div>
              <Show when={selfIsAdmin()}>
                <button
                  type="button"
                  class="w-8 h-8 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))] text-lg leading-none"
                  title={t("npo.page.members.add")}
                  aria-label={t("npo.page.members.add")}
                  onClick={() => setShowAdd(true)}
                >
                  +
                </button>
              </Show>
            </div>

            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead class="bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
                  <tr>
                    <th class="px-3 py-2 text-left">{t("npo.page.members.col.user")}</th>
                    <th class="px-3 py-2 text-left">{t("npo.page.members.col.confirmed")}</th>
                    <th class="px-3 py-2 text-left">{t("npo.page.members.col.roles")}</th>
                    <th class="px-3 py-2 text-left">{t("npo.page.members.col.admin")}</th>
                    <Show when={selfIsAdmin()}>
                      <th class="px-3 py-2 text-left">{t("npo.page.members.col.actions")}</th>
                    </Show>
                  </tr>
                </thead>
                <tbody>
                  <Show when={!membersLoading() && members().length === 0}>
                    <tr>
                      <td colSpan={selfIsAdmin() ? 5 : 4} class="px-3 py-8 text-center text-[hsl(var(--muted-foreground))]">
                        {t("npo.page.members.empty")}
                      </td>
                    </tr>
                  </Show>

                  <For each={members()}>
                    {(m) => (
                      <tr class="border-t border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]">
                        <td class="px-3 py-2"><UserCard author={m.user} compact /></td>
                        <td class="px-3 py-2"><Badge ok={m.confirmed} t={t} /></td>
                        <td class="px-3 py-2">
                          <Show when={(m.roles?.length || 0) > 0} fallback={<span class="opacity-60">—</span>}>
                            <div class="flex flex-wrap gap-1">
                              <For each={m.roles}>
                                {(r) => (
                                  <span class="px-2 py-0.5 text-xs rounded bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
                                    {r}
                                  </span>
                                )}
                              </For>
                            </div>
                          </Show>
                        </td>
                        <td class="px-3 py-2">
                          <input type="checkbox" checked={!!m.isAdmin} disabled class="accent-[hsl(var(--primary))]" aria-label={t("npo.page.members.adminFlag")} />
                        </td>
                        <Show when={selfIsAdmin()}>
                          <td class="px-3 py-2">
                            <span class="opacity-60">—</span>
                          </td>
                        </Show>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
              <Show when={membersLoading()}>
                <div class="flex justify-center p-4"><Spinner /></div>
              </Show>
            </div>
          </Show>

          <Show when={activeTab() === "tokens"}>
            <div class="text-sm text-[hsl(var(--muted-foreground))]">
              {t("npo.page.tokens.placeholder")}
            </div>
          </Show>
        </div>

        <AddMemberModal
          isOpen={showAdd()}
          onClose={() => setShowAdd(false)}
          npoAddr={npoAddr()}
          onAdded={async () => {
            setShowAdd(false);
            await refreshMembers();
          }}
        />
      </Show>
    </div>
  );
}
