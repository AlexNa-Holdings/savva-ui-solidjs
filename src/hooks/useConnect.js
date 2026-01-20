// src/hooks/useConnect.js
import { createSignal, onMount } from "solid-js";
import { parse } from "yaml";
import { configureEndpoints, httpBase } from "../net/endpoints";

export function useConnect() {
  const [config, setConfig] = createSignal(null);
  const [info, setInfo] = createSignal(null);
  const [error, setError] = createSignal(null);
  const [loading, setLoading] = createSignal(true);

  onMount(async () => {
    try {
      const res = await fetch("/default_connect.yaml", { cache: "no-store" });
      if (!res.ok) throw new Error(`YAML load failed: ${res.status}`);
      const text = await res.text();
      const data = parse(text);

      // Support both legacy format (backendLink) and new multi-chain format (chains array)
      let backendLink = data.backendLink;
      if (!backendLink && Array.isArray(data.chains) && data.chains.length > 0) {
        // New format: use the first chain's rpc as backendLink
        backendLink = data.chains[0].rpc;
      }
      if (!backendLink) throw new Error("Missing backendLink or chains in config");

      // Configure endpoints once
      configureEndpoints({
        backendLink: backendLink,
        domain: data.domain || "",
      });

      const cfg = {
        domain: data.domain || "",
        backendLink: httpBase(), // normalized canonical HTTP base
        default_ipfs_link: data.default_ipfs_link || ""
      };
      setConfig(cfg);

      const infoRes = await fetch(httpBase() + "info", { headers: { Accept: "application/json" } });
      if (!infoRes.ok) throw new Error(`/info failed: ${infoRes.status}`);
      const infoData = await infoRes.json();
      setInfo(infoData);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  });

  return { config, info, error, loading };
}