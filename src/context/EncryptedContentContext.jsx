// src/context/EncryptedContentContext.jsx
import { createContext, useContext, createSignal } from "solid-js";

/**
 * Context for tracking currently viewed encrypted post and its decryption key
 * This allows automatic decryption of all resources (images, markdown, etc.)
 * fetched from the post's data folder
 */

const EncryptedContentContext = createContext();

export function EncryptedContentProvider(props) {
  // Store the current post's encryption key for automatic decryption
  // Structure: { dataCid: string, postSecretKey: string }
  const [currentEncryptedPost, setCurrentEncryptedPost] = createSignal(null);

  const contextValue = {
    currentEncryptedPost,
    setCurrentEncryptedPost,

    /**
     * Check if a given CID path belongs to the currently viewed encrypted post
     * @param {string} cidPath - IPFS path like "QmXXX/file.jpg"
     * @returns {boolean}
     */
    isFromEncryptedPost: (cidPath) => {
      const current = currentEncryptedPost();
      if (!current || !current.dataCid || !current.postSecretKey) return false;

      // Check if the path starts with the data CID
      const normalizedPath = cidPath?.trim() || "";
      return normalizedPath.startsWith(current.dataCid);
    },

    /**
     * Get the decryption key for the current encrypted post
     * @returns {string|null} - Hex string of the post secret key
     */
    getDecryptionKey: () => {
      const current = currentEncryptedPost();
      return current?.postSecretKey || null;
    },

    /**
     * Clear the current encrypted post context
     */
    clearEncryptedPost: () => {
      setCurrentEncryptedPost(null);
    }
  };

  return (
    <EncryptedContentContext.Provider value={contextValue}>
      {props.children}
    </EncryptedContentContext.Provider>
  );
}

export function useEncryptedContent() {
  const context = useContext(EncryptedContentContext);
  if (!context) {
    throw new Error("useEncryptedContent must be used within EncryptedContentProvider");
  }
  return context;
}
