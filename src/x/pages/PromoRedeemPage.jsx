// src/x/pages/PromoRedeemPage.jsx
import { Show, createSignal, createMemo, onMount, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { useHashRouter, navigate } from "../../routing/smartRouter.js";
import ClosePageButton from "../ui/ClosePageButton.jsx";
import Spinner from "../ui/Spinner.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import { isWalletAvailable, walletAccount, connectWallet, eagerConnect, walletChainId } from "../../blockchain/wallet.js";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { getWsApi } from "../../net/wsRuntime.js";
import { toChecksumAddress } from "../../blockchain/utils.js";
import { keccak256, toHex } from "viem";
import { dbg } from "../../utils/debug.js";
import { pushToast } from "../../ui/toast.js";

function bi(v){try{if(typeof v==="bigint")return v;if(typeof v==="number")return BigInt(v);if(typeof v==="string")return BigInt(v)}catch{}return 0n;}
function normalizePromo(raw,fallbackHash){
  const donator=raw?.donator??raw?.[0]??null;
  const savva=raw?.savva_amount??raw?.savvaAmount??raw?.[1]??0n;
  const hash=raw?.hash??raw?.[2]??fallbackHash??"0x";
  const basic=raw?.pls_amount??raw?.plsAmount??raw?.[3]??0n;
  const validTill=raw?.valid_till??raw?.valid_til??raw?.validTill??raw?.[4]??0n;
  return{hash,donator,savva:bi(savva),basic:bi(basic),validTill:bi(validTill)};
}

export default function PromoRedeemPage(){
  const app = useApp();
  const { t } = app;
  const { route } = useHashRouter();

  const hashParam = createMemo(()=>{
    const r=String(route()||"");
    if(!r.startsWith("/promo-code/")) return "";
    return r.slice("/promo-code/".length).split(/[?#]/)[0].trim();
  });

  const [walletDetected,setWalletDetected]=createSignal(isWalletAvailable());
  const [checkingInstall,setCheckingInstall]=createSignal(false);

  const acct = () => walletAccount() || "";

  const desiredId = createMemo(() => {
    const v = app.desiredChainId?.();
    if (v != null) return v;
    return app.desiredChain?.()?.id ?? null;
  });
  const chainOk = createMemo(() =>
    walletChainId() != null &&
    desiredId() != null &&
    walletChainId() === desiredId()
  );
  const desiredChainName = createMemo(() => app.desiredChain?.()?.name || "Network");

  const [loadingPromo,setLoadingPromo]=createSignal(false);
  const [promo,setPromo]=createSignal(null);
  const [notFound,setNotFound]=createSignal(false);

  const [secret,setSecret]=createSignal("");
  const secretHash=createMemo(()=>{try{const s=(secret()||"").trim();return s?keccak256(toHex(s)):""}catch{return""}});
  const hashMatches=createMemo(()=> (hashParam()||"").toLowerCase()===(secretHash()||"").toLowerCase());
  const expired=createMemo(()=>{const v=Number(promo()?.validTill||0n)*1000;return v>0 && Date.now()>v;});
  const hasAnyAmount=createMemo(()=>{const p=promo();return !!p && ((p.savva??0n)>0n || (p.basic??0n)>0n);});

  const needInstall=createMemo(()=>!walletDetected());
  const needConnect=createMemo(()=>walletDetected() && !acct());
  const needSwitch =createMemo(()=>walletDetected() && !!acct() && !chainOk());

  async function pollForWalletInstall(){
    if(walletDetected()) return;
    setCheckingInstall(true);
    try{
      const start=Date.now();
      while(!isWalletAvailable() && Date.now()-start<120000){ await new Promise(r=>setTimeout(r,1000)); }
      setWalletDetected(isWalletAvailable());
      if(isWalletAvailable()){ try{await eagerConnect();}catch{} }
    }finally{ setCheckingInstall(false); }
  }

  async function ensureNetwork(){
    try{ await app.ensureWalletOnDesiredChain?.(); }catch(e){ dbg.log("PromoRedeemPage","ensureNetwork failed",e); }
  }

  async function loadPromo(){
    const h=hashParam();
    if(!h || !acct() || !chainOk()) return;
    setLoadingPromo(true); setNotFound(false); setPromo(null);
    try{
      const promoC=await getSavvaContract(app,"Promo");
      try{
        const row=await promoC.read.getPromoCode([h]);
        const p=normalizePromo(row,h);
        if(bi(p.savva)===0n && bi(p.basic)===0n && bi(p.validTill)===0n){ setNotFound(true);} else { setPromo(p); }
      }catch{
        try{
          const row=await promoC.read.promoCodesMap([h]);
          const p=normalizePromo(row,h);
          if(bi(p.savva)===0n && bi(p.basic)===0n && bi(p.validTill)===0n){ setNotFound(true);} else { setPromo(p); }
        }catch{ setNotFound(true); }
      }
    }finally{ setLoadingPromo(false); }
  }

  async function onRedeem(){
    const h=hashParam(); const s=(secret()||"").trim(); const u=toChecksumAddress(acct());
    if(!h||!s||!u||!hashMatches()||!hasAnyAmount()||expired()) return;
    try{
      await getWsApi().call("redeem-promo",{ hash:h, secret:s, user:u }); // ✅ renamed
      pushToast({type:"success",message:t("promocodes.redeem.requestSent")});
      navigate(`/${u}?tab=wallet`);
    }catch(e){
      dbg.log("PromoRedeemPage","redeem failed",e);
      pushToast({type:"error",message:t("promocodes.redeem.error"),details:{message:String(e?.message||e||"Error")}});
    }
  }

  onMount(async ()=>{
    if(walletDetected()){ try{await eagerConnect();}catch{} }
    await loadPromo();
  });

  createEffect(()=>{ void (walletDetected(), walletChainId(), acct(), desiredId(), hashParam(), loadPromo()); });

  return (
    <main class="p-4 max-w-3xl mx-auto space-y-4">
      <ClosePageButton />
      <h1 class="text-xl font-semibold">{t("promocodes.redeem.title")}</h1>

      <Show when={needInstall()}>
        <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 space-y-3">
          <h2 class="font-semibold">{t("promocodes.redeem.install.title")}</h2>
          <p class="text-sm opacity-80">{t("promocodes.redeem.install.desc")}</p>
          <div class="flex flex-wrap gap-2">
            <a class="px-3 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90" href="https://rabby.io" target="_blank" rel="noopener noreferrer">
              {t("promocodes.redeem.install.rabby")}
            </a>
            <a class="px-3 py-2 rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]/20" href="https://metamask.io" target="_blank" rel="noopener noreferrer">
              {t("promocodes.redeem.install.metamask")}
            </a>
            <button type="button" disabled={checkingInstall()} class={`px-3 py-2 rounded ${checkingInstall()?"bg-[hsl(var(--primary))]/50 cursor-not-allowed text-[hsl(var(--primary-foreground))]":"bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"}`} onClick={pollForWalletInstall}>
              {checkingInstall()?t("promocodes.redeem.install.checking"):t("promocodes.redeem.install.check")}
            </button>
          </div>
        </div>
      </Show>

      <Show when={walletDetected() && needConnect()}>
        <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 space-y-3">
          <h2 class="font-semibold">{t("promocodes.redeem.connect.title")}</h2>
          <p class="text-sm opacity-80">{t("promocodes.redeem.connect.desc")}</p>
          <button type="button" class="px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
            onClick={async()=>{ try{await connectWallet();}finally{ await loadPromo(); }}}>
            {t("promocodes.redeem.connect.btn")}
          </button>
        </div>
      </Show>

      <Show when={walletDetected() && !!acct() && !chainOk()}>
        <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 space-y-3">
          <h2 class="font-semibold">{t("promocodes.redeem.network.title")}</h2>
          <p class="text-sm opacity-80">{t("promocodes.redeem.network.desc")}</p>
          <button type="button" class="px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
            onClick={async()=>{ try{await ensureNetwork();}finally{ await loadPromo(); }}}>
            {t("promocodes.redeem.network.btn",{ chain: desiredChainName() })}
          </button>
        </div>
      </Show>

      <Show when={walletDetected() && !!acct() && chainOk()}>
        <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 space-y-4">
          <div class="text-sm">
            <div class="opacity-70 mb-1">{t("promocodes.redeem.address")}</div>
            <code class="inline-block px-2 py-1 rounded bg-[hsl(var(--muted))] border border-[hsl(var(--input))]">
              {toChecksumAddress(acct())}
            </code>
          </div>

          <Show when={loadingPromo()} fallback={
            <Show when={promo()} fallback={
              <Show when={notFound()} fallback={<></>}>
                <div class="p-3 rounded bg-[hsl(var(--destructive))]/10 border border-[hsl(var(--destructive))]/40 text-[hsl(var(--destructive))]">
                  {t("promocodes.redeem.notFound")}
                </div>
              </Show>
            }>
              <div class="space-y-3">
                <div class="font-semibold">{t("promocodes.redeem.amountsTitle")}</div>

                <Show when={(promo().savva??0n)>0n}>
                  <div class="flex items-center justify-between">
                    <div class="opacity-80 text-sm">{t("promocodes.redeem.amount.savva")}</div>
                    <TokenValue amount={promo().savva} format="compact" />
                  </div>
                </Show>

                <Show when={(promo().basic??0n)>0n}>
                  <div class="flex items-center justify-between">
                    <div class="opacity-80 text-sm">{t("promocodes.redeem.amount.base")}</div>
                    <TokenValue amount={promo().basic} tokenAddress="0" format="compact" />
                  </div>
                </Show>

                <Show when={expired()}>
                  <div class="p-2 rounded bg-[hsl(var(--destructive))]/10 border border-[hsl(var(--destructive))]/40 text-[hsl(var(--destructive))] text-sm">
                    {t("promocodes.redeem.expired")}
                  </div>
                </Show>

                <div class="space-y-1">
                  <label class="block text-sm font-medium">{t("promocodes.redeem.enterCode")}</label>
                  <input type="text" inputmode="numeric" autocomplete="off" spellcheck={false} placeholder="123-456-789"
                    value={secret()} onInput={(e)=>setSecret(e.currentTarget.value)}
                    class="w-full px-3 py-2 rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))]" />
                  <div class="text-xs opacity-70">{t("promocodes.redeem.codeHelp")}</div>
                  <Show when={secret() && !hashMatches()}>
                    <div class="text-xs text-[hsl(var(--destructive))]">{t("promocodes.redeem.codeMismatch")}</div>
                  </Show>
                </div>

                <div class="pt-2">
                  <button type="button" disabled={!hasAnyAmount()||expired()||!hashMatches()}
                    class={`px-4 py-2 rounded ${(!hasAnyAmount()||expired()||!hashMatches())?"bg-[hsl(var(--primary))]/50 cursor-not-allowed text-[hsl(var(--primary-foreground))]":"bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"}`}
                    onClick={onRedeem}>
                    {t("promocodes.redeem.redeemBtn")}
                  </button>
                </div>
              </div>
            </Show>
          }>
            <div class="flex items-center gap-2 text-sm opacity-80">
              <Spinner class="w-4 h-4" />
              <span>{t("promocodes.redeem.loadingPromo")}</span>
            </div>
          </Show>
        </div>
      </Show>
    </main>
  );
}
