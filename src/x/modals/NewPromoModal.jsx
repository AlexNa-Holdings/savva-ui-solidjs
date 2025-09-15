// src/x/modals/NewPromoModal.jsx
import { Show, Switch, Match, createSignal, createMemo, For, onMount, createResource, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import Modal from "./Modal.jsx";
import AmountInput from "../ui/AmountInput.jsx";
import * as chain from "../../blockchain/contracts.js";
import { sendAsActor } from "../../blockchain/npoMulticall.js";
import { getTokenInfo } from "../../blockchain/tokenMeta.jsx";
import { keccak256, toHex, formatUnits } from "viem";
import { dbg } from "../../utils/debug.js";

const PROMO_MIN_ABI = [
  { type: "function", name: "processor_fee", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "createPromoCode", stateMutability: "payable",
    inputs: [{ name: "_savva_amount", type: "uint256" }, { name: "_hash", type: "bytes32" }, { name: "_valid_till", type: "uint256" }], outputs: [] }
];
const ERC20_MIN_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }
];
const MAX_UINT256 = (1n << 256n) - 1n;

function CheckmarkIcon(p){return(<svg viewBox="0 0 24 24" class={p.class||"w-5 h-5"} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>);}
function StepIcon(p){return(<div class={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${p.class}`}><Show when={p.status==="completed"}><CheckmarkIcon class="text-white"/></Show><Show when={p.status==="active"}><div class="w-4 h-4 rounded-full bg-blue-500"/></Show><Show when={p.status==="pending"}><div class="w-2 h-2 rounded-full bg-gray-400"/></Show></div>);}

const STEPS=[
  {id:"enter",title:"promocodes.new.steps.enter",help:"promocodes.new.steps.enter.help"},
  {id:"save",title:"promocodes.new.steps.save",help:"promocodes.new.steps.save.help"}
];

export default function NewPromoModal(props){
  const app = useApp();
  const { t } = app;

  const [currentStepIndex, setCurrentStepIndex] = createSignal(0);
  const [publishing, setPublishing] = createSignal(false);

  const [savvaAddr, setSavvaAddr] = createSignal("");
  onMount(async () => {
    try {
      const c = await chain.getSavvaContract(app, "SavvaToken");
      setSavvaAddr(String(c?.address || ""));
    } catch {}
  });

  const [savvaText, setSavvaText] = createSignal("0");
  const [savvaWei, setSavvaWei] = createSignal(0n);
  const [basicText, setBasicText] = createSignal("0");
  const [basicWei, setBasicWei] = createSignal(0n);
  const [validDays, setValidDays] = createSignal(7);

  const [promoCode, setPromoCode] = createSignal("");
  const [promoHash, setPromoHash] = createSignal("0x");

  const [confirmed, setConfirmed] = createSignal(false);
  const [copied, setCopied] = createSignal(false);

  // reset everything whenever the modal opens
  function resetWizard(){
    setCurrentStepIndex(0);
    setPublishing(false);
    setSavvaText("0"); setSavvaWei(0n);
    setBasicText("0"); setBasicWei(0n);
    setValidDays(7);
    setPromoCode(""); setPromoHash("0x");
    setConfirmed(false); setCopied(false);
  }
  createEffect(() => { if (props.open) resetWizard(); });

  const canGenerate = createMemo(() => (savvaWei() > 0n || basicWei() > 0n) && validDays() >= 1 && validDays() <= 90);

  const chainId = createMemo(() => app.desiredChain()?.id || 0);
  const [baseMeta] = createResource(() => ["", chainId()], ([addr]) => getTokenInfo(app, addr));
  const baseTokenSymbol = createMemo(() => baseMeta()?.symbol || app.desiredChain()?.nativeCurrency?.symbol || "PLS");

  const savvaPrice = createMemo(() => Number(app.savvaTokenPrice?.()?.price ?? app.tokenPrices?.()?.savva_token_price ?? 0));
  const basePrice  = createMemo(() => Number(app.baseTokenPrice?.()?.price  ?? app.tokenPrices?.()?.base_token_price  ?? 0));

  const fmtNum = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  const fmtUsd = (v) => v.toLocaleString(undefined, { style: "currency", currency: "USD" });

  const savvaUnits = createMemo(() => Number(formatUnits(savvaWei(), 18)));
  const baseUnits  = createMemo(() => Number(formatUnits(basicWei(), 18)));

  const shareUrl = createMemo(() => { try { return `${window.location.origin}/promo-code/${promoHash()}`; } catch { return `/promo-code/${promoHash()}`; }});
  const shareText = createMemo(() => {
    const lines = [`${t("promocodes.new.share.link")}: ${shareUrl()}`];
    if (savvaWei() > 0n) { const usd = savvaUnits() * savvaPrice(); lines.push(`${t("promocodes.new.share.savvaAmount")}: ${fmtNum(savvaUnits())} (${fmtUsd(usd)})`); }
    if (basicWei() > 0n) { const usd = baseUnits() * basePrice(); lines.push(`${baseTokenSymbol()} ${t("promocodes.new.share.tokenAmountSuffix")}: ${fmtNum(baseUnits())} (${fmtUsd(usd)})`); }
    lines.push(`${t("promocodes.new.share.code")}: ${promoCode()}`);
    return lines.join("\n");
  });

  function makeNumericCode(){
    const b=new Uint8Array(9);
    (globalThis.crypto||window.crypto).getRandomValues(b);
    const d=Array.from(b,x=>String(x%10)).join("");
    return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6,9)}`;
  }

  function onGenerate(){
    if(!canGenerate()) return;
    const code = makeNumericCode();
    const hash = keccak256(toHex(code));
    setPromoCode(code); setPromoHash(hash);
    setConfirmed(false); setCopied(false);
    setCurrentStepIndex(1);
  }

  async function copyShareText(){
    const text = shareText();
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(()=>setCopied(false),1500); return; } catch {}
    try {
      const ta=document.createElement("textarea"); ta.value=text; ta.setAttribute("readonly",""); ta.style.position="fixed"; ta.style.top="-9999px";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
      setCopied(true); setTimeout(()=>setCopied(false),1500);
    } catch {}
  }

  async function resolvePromo(){
    try { const c = await chain.getSavvaContract(app, "Promo"); if(c?.address) return { address:c.address, abi:c.abi||PROMO_MIN_ABI, read:c.read }; } catch(e){ dbg.log("NewPromoModal","getSavvaContract('Promo') failed", e); }
    try { const c = await chain.getContract?.(app, "Promo"); if(c?.address) return { address:c.address, abi:c.abi||PROMO_MIN_ABI, read:c.read }; } catch(e){ dbg.log("NewPromoModal","getContract('Promo') failed", e); }
    return null;
  }

  async function onPublish(){
    if(!confirmed() || publishing()) return;
    setPublishing(true);
    try{
      const promo = await resolvePromo();
      if(!promo) throw new Error("Promo contract unavailable");

      let processorFee = 0n;
      try { processorFee = await (promo.read?.processor_fee?.() ?? 0n); } catch(e){ dbg.log("NewPromoModal","processor_fee read failed", e); }

      const nowSec = Math.floor(Date.now()/1000);
      const days = Math.max(1, Math.min(90, Number(validDays())));
      const validTill = BigInt(nowSec + days*86400);

      if (savvaWei() > 0n) {
        const savva = await chain.getSavvaContract(app, "SavvaToken");
        await sendAsActor(app, {
          target: savva.address,
          abi: ERC20_MIN_ABI,
          functionName: "approve",
          args: [promo.address, MAX_UINT256],
        });
      }

      await sendAsActor(app, {
        contractName: "Promo",
        functionName: "createPromoCode",
        args: [savvaWei(), promoHash(), validTill],
        value: basicWei() + processorFee,
      });

      props.onCreated?.();
    }catch(e){
      dbg.log("NewPromoModal","publish error", e);
    }finally{
      setPublishing(false);
    }
  }

  const headerTitle = createMemo(()=> currentStepIndex()===0 ? t("promocodes.new.title") : t("promocodes.new.titleSave"));

  const footer = createMemo(() => (
    <div class="flex items-center justify-between w-full">
      <div class="flex items-center gap-2">
        <Show when={currentStepIndex() > 0}>
          <button type="button" class="px-3 py-2 rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]/20" onClick={()=>setCurrentStepIndex(0)}>
            {t("common.back")}
          </button>
        </Show>
      </div>
      <Switch>
        <Match when={currentStepIndex()===0}>
          <button
            type="button"
            disabled={!canGenerate()}
            aria-disabled={!canGenerate()}
            class={`px-3 py-2 rounded text-[hsl(var(--primary-foreground))] hover:opacity-90 ${canGenerate()?"bg-[hsl(var(--primary))]":"bg-[hsl(var(--primary))]/50 cursor-not-allowed"}`}
            onClick={onGenerate}
          >
            {t("promocodes.new.generate")}
          </button>
        </Match>
        <Match when={currentStepIndex()===1}>
          <button
            type="button"
            disabled={!confirmed()||publishing()}
            aria-disabled={!confirmed()||publishing()}
            class={`px-3 py-2 rounded text-[hsl(var(--primary-foreground))] hover:opacity-90 ${confirmed()&&!publishing()?"bg-[hsl(var(--primary))]":"bg-[hsl(var(--primary))]/50 cursor-not-allowed"}`}
            onClick={onPublish}
          >
            {publishing()?t("promocodes.new.publishing"):t("promocodes.new.publish")}
          </button>
        </Match>
      </Switch>
    </div>
  ));

  return (
    <Modal isOpen={props.open} onClose={props.onClose} title={headerTitle()} size="3xl" footer={footer()}>
      <div class="flex gap-6 py-4">
        {/* Steps rail */}
        <div class="w-48 flex-shrink-0">
          <For each={STEPS}>{(step, idx) => {
            const status = createMemo(()=> idx()<currentStepIndex() ? "completed" : idx()===currentStepIndex() ? "active" : "pending");
            const cls = createMemo(()=> status()==="completed"?"bg-green-500 border-green-500" : status()==="active"?"border-blue-500":"border-gray-400");
            return (
              <div class="flex items-start">
                <div class="flex flex-col items-center mr-4">
                  <StepIcon status={status()} class={cls()} />
                  <Show when={idx() < STEPS.length - 1}><div class="w-px h-8 bg-gray-300" /></Show>
                </div>
                <div>
                  <h4 class="font-semibold text-sm">{t(step.title)}</h4>
                  <p class="text-xs text-[hsl(var(--muted-foreground))]">{t(step.help)}</p>
                </div>
              </div>
            );
          }}</For>
        </div>

        {/* Step content */}
        <div class="flex-1 min-w-0 min-h-[22rem]">
          <Switch>
            <Match when={currentStepIndex()===0}>
              <div class="space-y-6">
                <p class="text-sm opacity-80">{t("promocodes.new.step1.explainer")}</p>
                <div class="space-y-4">
                  <AmountInput
                    label={t("promocodes.new.labels.savvaAmount")}
                    tokenAddress={savvaAddr() || undefined}
                    value={savvaText()}
                    onChange={(e)=>{ setSavvaText(e.text); if(typeof e.amountWei==="bigint") setSavvaWei(e.amountWei); }}
                  />
                  <AmountInput
                    label={`${baseTokenSymbol()} ${t("promocodes.new.labels.amount")}`}
                    tokenAddress="0"
                    value={basicText()}
                    onChange={(e)=>{ setBasicText(e.text); if(typeof e.amountWei==="bigint") setBasicWei(e.amountWei); }}
                  />
                </div>
                <div class="sm:w-72">
                  <label class="block text-sm font-medium">
                    <div class="mb-1">{t("promocodes.new.labels.validDays")}</div>
                    <input
                      type="number" min="1" max="90" step="1" value={validDays()}
                      onInput={(e)=>{ const v=Math.max(1,Math.min(90,Number(e.currentTarget.value||0))); setValidDays(isFinite(v)?v:7); }}
                      class="w-full px-3 py-2 rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))]"
                    />
                    <div class="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{t("promocodes.new.labels.validDays.help")}</div>
                  </label>
                </div>
              </div>
            </Match>

            <Match when={currentStepIndex()===1}>
              <div class="space-y-5">
                <p class="text-sm opacity-80">{t("promocodes.new.save.shareIntro")}</p>

                <div class="rounded border border-[hsl(var(--border))] p-3 bg-[hsl(var(--muted))]/30">
                  <div class="flex items-center justify-between mb-2">
                    <div class="text-xs opacity-70">{t("promocodes.new.shareTextLabel")}</div>
                    <button
                      type="button"
                      class={`px-2 py-1 text-xs rounded cursor-pointer transition ${copied()?"bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]":"bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"} hover:opacity-90`}
                      onClick={copyShareText}
                    >
                      {copied()?t("promocodes.new.copy.done"):t("promocodes.new.copy")}
                    </button>
                  </div>
                  <pre class="font-mono text-sm whitespace-pre-wrap break-words p-2 rounded bg-[hsl(var(--background))] border border-[hsl(var(--input))]">
{shareText()}
                  </pre>
                </div>

                <label class="flex items-start gap-2">
                  <input type="checkbox" checked={confirmed()} onInput={(e)=>setConfirmed(e.currentTarget.checked)} class="mt-0.5"/>
                  <span class="text-sm">{t("promocodes.new.confirmSaved.checkbox")}</span>
                </label>
              </div>
            </Match>
          </Switch>
        </div>
      </div>
    </Modal>
  );
}
