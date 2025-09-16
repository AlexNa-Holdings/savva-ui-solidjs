// src/x/pages/NpoPage.jsx
import { Show, createMemo, createSignal, onMount, createEffect } from "solid-js";
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
import EditPermissionsModal from "../modals/EditPermissionsModal.jsx";
import { pushErrorToast } from "../../ui/toast.js";
import { dbg } from "../../utils/debug.js";
import NpoUsers from "../npo/NpoUsers.jsx";
import NpoTOokens from "../npo/NpoTOokens.jsx";
import NpoRoles from "../npo/NpoRoles.jsx";

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
const sameAddr = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();
const norm = (a) => String(a || "").toLowerCase();

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
    { id: "users", label: t("npo.page.tabs.users") },
    { id: "roles", label: t("npo.page.tabs.roles") },
    { id: "tokens", label: t("npo.page.tabs.tokens") },
  ]));

  const [members, setMembers] = createSignal([]);
  const [membersLoading, setMembersLoading] = createSignal(false);
  const [selfIsAdmin, setSelfIsAdmin] = createSignal(false);
  const [publicClient, setPublicClient] = createSignal(null);

  const [refreshEpoch, setRefreshEpoch] = createSignal(0);

  const [adminToggling, setAdminToggling] = createSignal(new Set());
  const setAdminBusy = (addr, on) =>
    setAdminToggling((prev) => {
      const key = norm(addr);
      const next = new Set(prev);
      if (on) next.add(key); else next.delete(key);
      return next;
    });
  const isAdminBusy = (addr) => adminToggling().has(norm(addr));

  const [showAdd, setShowAdd] = createSignal(false);
  const [editOpen, setEditOpen] = createSignal(false);
  const [editTarget, setEditTarget] = createSignal({ address: "", user: null });

  createEffect(() => dbg.log("NPO:init", { route: route(), identifier: identifier() }));

  async function ensureWallet() {
    if (walletAccount()) return true;
    if (!isWalletAvailable()) return false;
    setNeedWallet(true);
    try {
      await connectWallet();
      setNeedWallet(false);
      return !!walletAccount();
    } catch { return false; }
  }

  async function fetchNpoCore(id) {
    const wsParams = { domain: app.selectedDomainName() };
    const me = app.authorizedUser?.();
    if (me?.address) wsParams.caller = me.address;
    if (id.startsWith("@")) wsParams.user_name = id.slice(1);
    else wsParams.user_addr = id;
    const data = await app.wsCall?.("get-user", wsParams);
    if (!data) return null;
    if (!id.startsWith("@") && data.name) navigate(`/npo/@${encodeURIComponent(data.name)}`, { replace: true });
    const address = String(data.address || (!id.startsWith("@") ? id : "") || "");
    return { user: { ...data, address }, address };
  }

  function makePublicClient() {
    const chain = app.desiredChain?.();
    return createPublicClient({ chain, transport: http(chain?.rpcUrls?.[0] ?? undefined) });
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
        return { address: memberAddr, confirmed: nm.confirmed, lastWeekChecked: nm.lastWeekChecked, isAdmin: !!admins[i], roles: roleNames };
      });
      const wsBase = { domain: app.selectedDomainName() };
      const me = app.authorizedUser?.();
      if (me?.address) wsBase.caller = me.address;
      const enriched = await Promise.all(rows.map(async (row) => {
        try {
          const user = await app.wsCall?.("get-user", { ...wsBase, user_addr: row.address });
          return { ...row, user: { ...(user || {}), address: row.address } };
        } catch {
          return { ...row, user: { address: row.address } };
        }
      }));
      return enriched;
    } finally {
      setMembersLoading(false);
    }
  }

  async function handleAdminToggle(addr, makeAdmin) {
    const me = app.authorizedUser?.()?.address;
    if (sameAddr(addr, me) || !selfIsAdmin()) return;
    const target = addr;
    try {
      setAdminBusy(target, true);
      const client = await app.getGuardedWalletClient?.();
      if (!client) throw new Error(t("errors.walletRequired"));
      const c = getContract({ address: npoAddr(), abi: SavvaNPOAbi, client });
      const txHash = await (makeAdmin ? c.write.addAdmin([target]) : c.write.removeAdmin([target]));
      const pc = publicClient();
      if (pc && txHash) await pc.waitForTransactionReceipt({ hash: txHash });
      await fetchSelfAdmin(npoAddr(), pc);
      await refreshMembers();
      setAdminToggling(new Set());
      setRefreshEpoch((e) => e + 1);
    } catch (e) {
      pushErrorToast?.({ message: e?.message || t("errors.updateFailed") });
    } finally {
      setAdminBusy(target, false);
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

  const meAddr = () => app.authorizedUser?.()?.address || "";

  return (
    <div class="mx-auto w-full px-3">
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
            <NpoUsers
              t={t}
              meAddr={meAddr()}
              selfIsAdmin={selfIsAdmin()}
              members={members()}
              membersLoading={membersLoading()}
              isAdminBusy={isAdminBusy}
              refreshEpoch={refreshEpoch()}
              onOpenAdd={() => setShowAdd(true)}
              onOpenEdit={(addr, user) => { setEditTarget({ address: addr, user }); setEditOpen(true); }}
              onToggleAdmin={handleAdminToggle}
            />
          </Show>

          <Show when={activeTab() === "roles"}>
            <NpoRoles
              npoAddr={npoAddr()}
              selfIsAdmin={selfIsAdmin()}
              refreshEpoch={refreshEpoch()}
            />
          </Show>

          <Show when={activeTab() === "tokens"}>
            <NpoTOokens t={t} />
          </Show>
        </div>

        <AddMemberModal
          isOpen={showAdd()}
          onClose={() => setShowAdd(false)}
          npoAddr={npoAddr()}
          onAdded={async () => {
            setShowAdd(false);
            await refreshMembers();
            setAdminToggling(new Set());
            setRefreshEpoch((e) => e + 1);
          }}
        />

        <EditPermissionsModal
          isOpen={editOpen()}
          onClose={() => setEditOpen(false)}
          npoAddr={npoAddr()}
          memberAddress={editTarget().address}
          user={editTarget().user}
          onChanged={async () => {
            setEditOpen(false);
            await refreshMembers();
            setRefreshEpoch((e) => e + 1);
          }}
        />
      </Show>
    </div>
  );
}
