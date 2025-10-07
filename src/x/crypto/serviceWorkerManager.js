// src/x/crypto/serviceWorkerManager.js

/**
 * Service Worker Manager for Crypto-Proxy
 *
 * Handles:
 * - Service Worker registration and lifecycle
 * - Encryption context communication with SW
 * - SW readiness and health checks
 */

class ServiceWorkerManager {
  constructor() {
    this.registration = null;
    this.isReady = false;
    this.readyPromise = null;
    this.messageChannel = null;
  }

  /**
   * Check if Service Workers are supported
   */
  isSupported() {
    return 'serviceWorker' in navigator;
  }

  /**
   * Register the crypto Service Worker
   */
  async register() {
    if (!this.isSupported()) {
      console.warn('[SW Manager] Service Workers not supported in this browser');
      return false;
    }

    if (this.registration) {
      console.log('[SW Manager] Service Worker already registered');
      return true;
    }

    try {
      console.log('[SW Manager] Registering Service Worker...');

      this.registration = await navigator.serviceWorker.register('/crypto-sw.js', {
        scope: '/'
      });

      console.log('[SW Manager] Service Worker registered:', this.registration);

      // Wait for it to be active
      await this.waitForActive();

      // Set up message channel
      this.setupMessageChannel();

      this.isReady = true;
      console.log('[SW Manager] Service Worker is ready');

      return true;
    } catch (error) {
      console.error('[SW Manager] Service Worker registration failed:', error);
      return false;
    }
  }

  /**
   * Wait for Service Worker to become active
   */
  async waitForActive() {
    if (!this.registration) {
      throw new Error('Service Worker not registered');
    }

    // If already active, return immediately
    if (this.registration.active) {
      console.log('[SW Manager] Service Worker already active');
      return;
    }

    // Wait for installing or waiting SW to activate
    const sw = this.registration.installing || this.registration.waiting;
    if (!sw) {
      throw new Error('No Service Worker found');
    }

    return new Promise((resolve) => {
      sw.addEventListener('statechange', function onStateChange() {
        if (sw.state === 'activated') {
          sw.removeEventListener('statechange', onStateChange);
          resolve();
        }
      });
    });
  }

  /**
   * Set up message channel for communication with SW
   */
  setupMessageChannel() {
    if (!navigator.serviceWorker.controller) {
      console.warn('[SW Manager] No active Service Worker controller');
      return;
    }

    this.messageChannel = new MessageChannel();

    // Listen for messages from SW
    this.messageChannel.port1.onmessage = (event) => {
      console.log('[SW Manager] Message from SW:', event.data);
    };
  }

  /**
   * Send message to Service Worker
   */
  async sendMessage(message) {
    if (!navigator.serviceWorker.controller) {
      throw new Error('No active Service Worker controller');
    }

    return new Promise((resolve, reject) => {
      const messageChannel = new MessageChannel();

      messageChannel.port1.onmessage = (event) => {
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data);
        }
      };

      navigator.serviceWorker.controller.postMessage(message, [messageChannel.port2]);
    });
  }

  /**
   * Set encryption context in Service Worker
   *
   * @param {string} dataCid - Data folder CID
   * @param {string} postSecretKey - Post encryption key (hex)
   * @param {number} ttl - Time-to-live in milliseconds (optional)
   */
  async setEncryptionContext(dataCid, postSecretKey, ttl = 30 * 60 * 1000) {
    if (!this.isReady) {
      await this.register();
    }

    try {
      await this.sendMessage({
        type: 'SET_ENCRYPTION_CONTEXT',
        data: { dataCid, postSecretKey, ttl }
      });

      console.log(`[SW Manager] Set encryption context for ${dataCid}`);
      return true;
    } catch (error) {
      console.error('[SW Manager] Failed to set encryption context:', error);
      return false;
    }
  }

  /**
   * Clear encryption context for a specific dataCid
   */
  async clearEncryptionContext(dataCid) {
    if (!this.isReady) {
      console.warn('[SW Manager] Service Worker not ready');
      return false;
    }

    try {
      await this.sendMessage({
        type: 'CLEAR_ENCRYPTION_CONTEXT',
        data: { dataCid }
      });

      console.log(`[SW Manager] Cleared encryption context for ${dataCid}`);
      return true;
    } catch (error) {
      console.error('[SW Manager] Failed to clear encryption context:', error);
      return false;
    }
  }

  /**
   * Clear all encryption contexts
   */
  async clearAllContexts() {
    if (!this.isReady) {
      console.warn('[SW Manager] Service Worker not ready');
      return false;
    }

    try {
      await this.sendMessage({
        type: 'CLEAR_ALL_CONTEXTS',
        data: {}
      });

      console.log('[SW Manager] Cleared all encryption contexts');
      return true;
    } catch (error) {
      console.error('[SW Manager] Failed to clear all contexts:', error);
      return false;
    }
  }

  /**
   * Ping Service Worker to check if it's alive
   */
  async ping() {
    if (!this.isReady) {
      return false;
    }

    try {
      const response = await this.sendMessage({ type: 'PING', data: {} });
      console.log('[SW Manager] Ping response:', response);
      return response.pong === true;
    } catch (error) {
      console.error('[SW Manager] Ping failed:', error);
      return false;
    }
  }

  /**
   * Unregister Service Worker
   */
  async unregister() {
    if (!this.registration) {
      console.log('[SW Manager] No Service Worker to unregister');
      return true;
    }

    try {
      const success = await this.registration.unregister();
      if (success) {
        console.log('[SW Manager] Service Worker unregistered successfully');
        this.registration = null;
        this.isReady = false;
      }
      return success;
    } catch (error) {
      console.error('[SW Manager] Failed to unregister Service Worker:', error);
      return false;
    }
  }

  /**
   * Get Service Worker readiness status
   */
  getStatus() {
    return {
      supported: this.isSupported(),
      registered: !!this.registration,
      ready: this.isReady,
      active: !!navigator.serviceWorker.controller
    };
  }
}

// Create singleton instance
export const swManager = new ServiceWorkerManager();

// Auto-register on module load (can be disabled if needed)
if (typeof window !== 'undefined') {
  // Register when the page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      swManager.register().catch(console.error);
    });
  } else {
    swManager.register().catch(console.error);
  }
}

export default swManager;
