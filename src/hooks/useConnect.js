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
      if (!data.backendLink) throw new Error("Missing backendLink in config");

      // Configure endpoints once
      configureEndpoints({
        backendLink: data.backendLink,
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
      setInfo(await infoRes.json());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  });

  return { config, info, error, loading };
}