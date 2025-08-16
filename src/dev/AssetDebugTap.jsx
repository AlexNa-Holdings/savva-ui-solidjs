// src/dev/AssetDebugTap.jsx
/* src/dev/AssetDebugTap.jsx */
import { createEffect } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import { dbg } from "../utils/debug";

const dn = (d) => (typeof d === "string" ? d : d?.name || "");

export default function AssetDebugTap() {
  const app = useApp();

  // Track & log env
  let prevEnv;
  createEffect(() => {
    const next = app.assetsEnv?.();
    if (prevEnv !== next) {
      dbg.log("assets", "assetsEnv changed:", { prev: prevEnv, next });
      prevEnv = next;
    }
  });

  // Track & log base URL from /info
  let prevBase;
  createEffect(() => {
    const next = app.assetsBaseUrl?.();
    if (prevBase !== next) {
      dbg.log("assets", "assetsBaseUrl changed:", { prev: prevBase, next });
      prevBase = next;
    }
  });

  // Track & log selected domain
  let prevDomain;
  createEffect(() => {
    const next = dn(app.selectedDomain?.());
    if (prevDomain !== next) {
      dbg.log("assets", "selectedDomain changed:", { prev: prevDomain, next });
      prevDomain = next;
    }
  });

  // Track & log ACTIVE prefix the app uses for all assets
  let prevPrefix;
  createEffect(() => {
    const next = app.domainAssetsPrefix?.();
    if (prevPrefix !== next) {
      dbg.log("assets", "domainAssetsPrefix (ACTIVE) changed:", { prev: prevPrefix, next });
      prevPrefix = next;
    }
  });

  // Track & log where the config came from: remote (domain) vs default pack
  let prevSource;
  createEffect(() => {
    const next = app.domainAssetsSource?.();
    if (prevSource !== next) {
      dbg.log("assets", "domainAssetsSource changed:", { prev: prevSource, next });
      prevSource = next;
    }
  });

  // Track & log parsed config.yaml presence and key fields (logos/tabs)
  let prevStamp;
  createEffect(() => {
    const cfg = app.domainAssetsConfig?.();
    const stamp = cfg ? JSON.stringify({ cid: cfg.assets_cid || cfg.cid || null, gotLogos: !!(cfg.logos || cfg.logo), tabs: !!cfg.modules?.tabs }) : "null";
    if (prevStamp !== stamp) {
      dbg.group("assets", "domainAssetsConfig loaded/changed", () => {
        dbg.log("assets", "summary:", {
          hasConfig: !!cfg,
          hasLogos: !!(cfg?.logos || cfg?.logo),
          tabsPath: cfg?.modules?.tabs || null,
          assets_cid: cfg?.assets_cid || cfg?.cid || null,
        });
      });
      prevStamp = stamp;
    }
  });

  // Nothing to render
  return null;
}
