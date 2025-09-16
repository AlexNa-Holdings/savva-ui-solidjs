// src/x/modals/NpoRoleEditModal.jsx
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import Modal from "./Modal.jsx";
import Spinner from "../ui/Spinner.jsx";
import SavvaNPOAbi from "../../blockchain/abi/SavvaNPO.json";
import { createPublicClient, getContract, http, keccak256, stringToBytes } from "viem";
import { toChecksumAddress } from "../../blockchain/utils.js";
import { pushErrorToast, pushToast } from "../../ui/toast.js";
import { sendAsUser } from "../../blockchain/npoMulticall.js";
import { toHexBytes32 } from "../../blockchain/utils.js";

const isSelector = (s) => /^0x[0-9a-fA-F]{8}$/.test((s || "").trim());
function sigToSelector(text) {
  const s = (text || "").trim();
  if (!s) return "";
  if (isSelector(s)) return s.toLowerCase();
  if (!s.includes("(") || !s.endsWith(")")) return "";
  try {
    const h = keccak256(stringToBytes(s));
    return "0x" + h.slice(2, 10);
  } catch { return ""; }
}
function mkPerm(target = "") {
  return { mode: "known", knownKey: "", addr: target, any: true, funcs: [], input: "" };
}
function addrLcSafe(v) {
  try {
    const raw = typeof v === "function" ? v() : v;
    const a = (raw && (raw.address ?? raw)) ?? "";
    return String(a).trim().toLowerCase();
  } catch { return ""; }
}
function shortAddr(v, start = 6, end = 4) {
  const s = String((v && (v.address ?? v)) ?? "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(s)) return s;
  return `${s.slice(0, 2 + start)}…${s.slice(-end)}`;
}

export default function NpoRoleEditModal(props) {
  const app = useApp();
  const { t } = app;

  const isOpen = () => !!props.isOpen;
  const npoAddr = () => props.npoAddr;
  const editing = () => !!props.role?.hex;

  const [name, setName] = createSignal(props.role?.name || "");
  const [perms, setPerms] = createSignal([mkPerm()]);
  const [loading, setLoading] = createSignal(false);
  const [saving, setSaving] = createSignal(false);

  const knownContracts = createMemo(() => {
    const map = app.info?.()?.savva_contracts || {};
    return Object.entries(map).map(([key, val]) => {
      const addr = String((val && (val.address ?? val)) || "");
      const pretty = key.replace(/^contract_/, "").replace(/_/g, " ");
      const label = pretty.charAt(0).toUpperCase() + pretty.slice(1);
      return { key, addr, label };
    });
  });

  createEffect(async () => {
    if (!isOpen()) return;
    setName(props.role?.name || "");
    setPerms([mkPerm()]);
    if (!editing() || !npoAddr()) return;

    setLoading(true);
    try {
      const chain = app.desiredChain?.();
      const pc = createPublicClient({ chain, transport: http(chain?.rpcUrls?.[0] ?? undefined) });
      const c = getContract({ address: npoAddr(), abi: SavvaNPOAbi, client: pc });
      const raw = await c.read.getRolePermissions([props.role.hex]);

      const permsUi = (raw || []).map((p) => {
        const match = knownContracts().find((k) => addrLcSafe(k.addr) === addrLcSafe(p.targetContract));
        return {
          mode: match ? "known" : "custom",
          knownKey: match?.key || "",
          addr: p.targetContract,
          any: !p.allowedFunctions || p.allowedFunctions.length === 0,
          funcs: (p.allowedFunctions || []).map(String),
          input: "",
        };
      });
      setPerms(permsUi.length ? permsUi : [mkPerm()]);
    } catch (e) {
      pushErrorToast(e, { context: t("errors.loadFailed") });
    } finally {
      setLoading(false);
    }
  });

  function applyKnown(i, key) {
    setPerms((arr) => {
      const next = [...arr];
      const found = knownContracts().find((k) => k.key === key);
      next[i] = { ...next[i], mode: "known", knownKey: key, addr: found?.addr || "" };
      return next;
    });
  }
  function setCustomAddr(i, addr) {
    setPerms((arr) => {
      const next = [...arr];
      next[i] = { ...next[i], mode: "custom", knownKey: "", addr: addr || "" };
      return next;
    });
  }
  function toggleAny(i, any) {
    setPerms((arr) => {
      const next = [...arr];
      next[i] = { ...next[i], any, funcs: any ? [] : next[i].funcs };
      return next;
    });
  }
  function addFunc(i, text) {
    const sel = sigToSelector(text);
    if (!sel) return;
    setPerms((arr) => {
      const next = [...arr];
      const set = new Set(next[i].funcs || []);
      set.add(sel);
      next[i] = { ...next[i], funcs: [...set], input: "" };
      return next;
    });
  }
  function removeFunc(i, sel) {
    setPerms((arr) => {
      const next = [...arr];
      next[i] = { ...next[i], funcs: (next[i].funcs || []).filter((x) => x !== sel) };
      return next;
    });
  }
  function addPermRow() {
    setPerms((arr) => [...arr, mkPerm()]);
  }
  function removePermRow(i) {
    setPerms((arr) => (arr.length <= 1 ? arr : arr.filter((_, idx) => idx !== i)));
  }

  async function onSave() {
    if (saving()) return;
    const roleName = (name() || "").trim();
    if (!roleName && !editing()) return;

    try {
      setSaving(true);

      const resolved = perms().map((p) => {
        const addr = (p.mode === "known"
          ? (knownContracts().find((k) => k.key === p.knownKey)?.addr || p.addr)
          : p.addr) || "";
        const validAddr = toChecksumAddress(addr);
        if (!validAddr) throw new Error(t("errors.invalidAddress"));
        return {
          targetContract: validAddr,
          allowedFunctions: p.any ? [] : (p.funcs || []),
        };
      });

      const roleHex = editing() ? props.role.hex : toHexBytes32(roleName);

      await sendAsUser(app, {
        target: npoAddr(),
        abi: SavvaNPOAbi,
        functionName: "setRole",
        args: [roleHex, resolved],
      });

      pushToast({ type: "success", message: t("npo.roles.saved") });
      props.onSaved?.();
    } catch (e) {
      pushErrorToast(e, { context: t("errors.updateFailed") });
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <div class="flex items-center justify-end gap-2">
      <button class="px-2 py-1.5 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]" onClick={props.onClose} disabled={saving()}>
        {t("common.cancel")}
      </button>
      <button class="px-3 py-1.5 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60" onClick={onSave} disabled={saving()}>
        <Show when={saving()} fallback={t("common.save")}><Spinner class="w-5 h-5" /></Show>
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen()}
      onClose={props.onClose}
      title={editing() ? t("npo.roles.edit.title.edit") : t("npo.roles.edit.title.new")}
      size="7xl"
      footer={footer}
    >
      <div class="px-4 py-3 space-y-3 max-h-[78vh] overflow-y-auto">
        <div>
          <label class="block text-xs mb-1">{t("npo.roles.edit.name")}</label>
          <input
            class="w-full md:w-[720px] rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm leading-tight outline-none"
            placeholder={t("npo.roles.edit.name.placeholder")}
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            disabled={editing()}
          />
          <p class="text-[11px] mt-1 opacity-70">{t("npo.roles.edit.name.hint")}</p>
        </div>

        <div class="flex items-center justify-between">
          <h4 class="font-medium text-sm">{t("npo.roles.edit.permissions")}</h4>
          <button
            class="px-2 py-1 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))] text-sm"
            onClick={addPermRow}
          >
            {t("npo.roles.edit.addPermission")}
          </button>
        </div>

        <For each={perms()}>
          {(p, i) => (
            <div class="relative rounded border border-[hsl(var(--border))] p-2 mb-2">
              <button
                type="button"
                class="absolute right-2 top-2 h-7 w-7 rounded-md border border-[hsl(var(--destructive))] text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive-foreground))] leading-none"
                title={t("npo.roles.edit.remove")}
                aria-label={t("npo.roles.edit.remove")}
                onClick={() => removePermRow(i())}
              >
                ×
              </button>

              {/* one row: selector + plain address input */}
              <div class="grid sm:grid-cols-[1fr_1fr] gap-3 pr-9">
                <div>
                  <label class="block text-xs mb-1">{t("npo.roles.edit.target")}</label>
                  <select
                    class="w-full rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-2 py-1.5 h-9 text-sm leading-tight"
                    value={p.mode === "known" ? (p.knownKey || "") : ""}
                    onChange={(e) => {
                      const key = e.currentTarget.value;
                      if (key) applyKnown(i(), key);
                      else setCustomAddr(i(), p.addr);
                    }}
                    title={t("npo.roles.edit.target")}
                  >
                    <option value="">{t("npo.roles.edit.target.chooseCustom")}</option>
                    <For each={knownContracts()}>
                      {(k) => (
                        <option value={k.key} title={`${k.label} — ${k.addr}`}>
                          {k.label} — {shortAddr(k.addr)}
                        </option>
                      )}
                    </For>
                  </select>
                </div>

                <div>
                  <label class="block text-xs mb-1">{t("npo.roles.edit.targetAddress")}</label>
                  <input
                    class="w-full rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-2 py-1.5 h-9 text-sm leading-tight outline-none font-mono"
                    placeholder="0x…"
                    value={p.addr}
                    onInput={(e) => setCustomAddr(i(), e.currentTarget.value)}
                    spellcheck={false}
                    autocapitalize="off"
                    autocomplete="off"
                    autocorrect="off"
                  />
                </div>
              </div>

              <div class="mt-2">
                <div class="flex items-center gap-4">
                  <label class="inline-flex items-center gap-2 text-sm">
                    <input type="radio" class="accent-[hsl(var(--primary))]" checked={p.any} onChange={() => toggleAny(i(), true)} />
                    <span>{t("npo.roles.edit.anyFunction")}</span>
                  </label>
                  <label class="inline-flex items-center gap-2 text-sm">
                    <input type="radio" class="accent-[hsl(var(--primary))]" checked={!p.any} onChange={() => toggleAny(i(), false)} />
                    <span>{t("npo.roles.edit.specificFunctions")}</span>
                  </label>
                </div>

                <Show when={!p.any}>
                  <div class="mt-2">
                    <div class="flex gap-2">
                      <input
                        class="flex-1 rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-2 py-1.5 h-9 text-sm leading-tight outline-none"
                        placeholder={t("npo.roles.edit.funcSig.placeholder")}
                        value={p.input}
                        onInput={(e) => {
                          const v = e.currentTarget.value;
                          setPerms((arr) => {
                            const next = [...arr];
                            next[i()] = { ...next[i()], input: v };
                            return next;
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addFunc(i(), p.input);
                          }
                        }}
                      />
                      <button
                        class="px-2 py-1 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))] text-sm"
                        onClick={() => addFunc(i(), p.input)}
                      >
                        {t("npo.roles.edit.funcSig.add")}
                      </button>
                    </div>
                    <p class="text-[11px] mt-1 opacity-70">{t("npo.roles.edit.funcSig.hint")}</p>

                    <div class="mt-2 flex flex-wrap gap-2">
                      <For each={p.funcs}>
                        {(sel) => (
                          <span class="inline-flex items-center gap-2 text-xs px-2 py-1 rounded border border-[hsl(var(--border))]">
                            <code>{sel}</code>
                            <button class="opacity-70 hover:opacity-100" onClick={() => removeFunc(i(), sel)}>×</button>
                          </span>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>
            </div>
          )}
        </For>

        <Show when={loading()}>
          <div class="py-2"><Spinner /></div>
        </Show>
      </div>
    </Modal>
  );
}
