// src/ipfs/pinning/storage.js
import { dbg } from "../../utils/debug";

const STORAGE_KEY = "ipfs_pinning_services";
const PINNING_ENABLED_KEY = "ipfs_pinning_enabled";

export function getPinningServices() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    dbg.error("PinningStorage", "Failed to load services", e);
    return [];
  }
}

export function savePinningServices(services) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(services));
  } catch (e) {
    dbg.error("PinningStorage", "Failed to save services", e);
  }
}

export function addPinningService(service) {
  const services = getPinningServices();
  const newService = { ...service, id: crypto.randomUUID() };
  savePinningServices([...services, newService]);
  return newService;
}

export function updatePinningService(updatedService) {
  const services = getPinningServices();
  const newServices = services.map(s => s.id === updatedService.id ? updatedService : s);
  savePinningServices(newServices);
}

export function deletePinningService(serviceId) {
  const services = getPinningServices();
  const newServices = services.filter(s => s.id !== serviceId);
  savePinningServices(newServices);
}

export function isPinningEnabled() {
  try {
    return localStorage.getItem(PINNING_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setPinningEnabled(isEnabled) {
  try {
    localStorage.setItem(PINNING_ENABLED_KEY, isEnabled ? "1" : "0");
  } catch (e) {
    dbg.error("PinningStorage", "Failed to set pinning enabled state", e);
  }
}