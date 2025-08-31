// src/ipfs/pinning/manager.js
import { fetchWithTimeout } from "../../utils/net";

function cleanUrl(url) {
  return (url || "").trim().replace(/\/+$/, "");
}

/**
 * Pins a directory of files to a single pinning service.
 */
export async function pinDirectory(serviceConfig, files, options = {}) {
  const { onProgress } = options;
  const formData = new FormData();

  // Create a single root directory name for the entire upload.
  const directoryName = `savva-post-${Date.now()}`;

  for (const { file, path } of files) {
    // Prepend the root directory name to each file's path.
    formData.append('file', file, `${directoryName}/${path}`);
  }

  if (serviceConfig.apiUrl.includes('pinata')) {
    // The metadata name should match the directory name for clarity in the Pinata UI.
    const pinataMetadata = JSON.stringify({ name: directoryName });
    formData.append('pinataMetadata', pinataMetadata);
    // The `wrapWithDirectory` option is no longer needed as we are manually creating the structure.
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', serviceConfig.apiUrl, true);
    xhr.setRequestHeader('Authorization', `Bearer ${serviceConfig.apiKey}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          const cid = res?.IpfsHash;
          if (!cid) throw new Error("API response did not include an IpfsHash.");
          resolve(cid);
        } catch (e) { reject(e); }
      } else {
        reject(new Error(`API responded with status ${xhr.status}: ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.ontimeout = () => reject(new Error("The upload request timed out."));
    xhr.send(formData);
  });
}

/**
 * Tests a pinning service by uploading a single file, verifying it, and reporting progress.
 */
export async function testService(serviceConfig, options = {}) {
  const { onProgress } = options;
  let lastReportedStep = null; // Hoisted to the function scope
  const report = (step, status, details = "") => {
    lastReportedStep = { step, status, details };
    onProgress?.(lastReportedStep);
  };

  try {
    // 1. Create a unique file object
    report("create_file", "pending");
    const testContent = `SAVVA Pin Test @ ${new Date().toISOString()}`;
    const testFile = new File([testContent], "savva-test.txt", {
      type: "text/plain",
    });
    report("create_file", "success", { bytes: testFile.size });

    // 2. Pin the file via API
    report("pinning", "pending", serviceConfig.apiUrl);
    const formData = new FormData();
    formData.append("file", testFile);
    if (serviceConfig.apiUrl.includes("pinata")) {
      formData.append(
        "pinataOptions",
        JSON.stringify({ wrapWithDirectory: false })
      );
    }

    const res = await fetchWithTimeout(serviceConfig.apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceConfig.apiKey}` },
      body: formData,
      timeoutMs: 20000,
    });
    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`API responded with status ${res.status}: ${errorBody}`);
    }
    const pinResponse = await res.json();
    report("pinning", "success", { status: res.status });

    // 3. Get the CID from the response
    report("get_cid", "pending");
    const cid = pinResponse?.IpfsHash;
    if (!cid) throw new Error("API response did not include an IpfsHash.");
    report("get_cid", "success", { cid });

    // 4. Verify availability on the gateway
    const gateway = cleanUrl(serviceConfig.gatewayUrl);
    const verifyUrl = `${gateway}/ipfs/${cid}`;
    report("verify", "pending", verifyUrl);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const verifyRes = await fetchWithTimeout(verifyUrl, { timeoutMs: 30000 });
    if (!verifyRes.ok)
      throw new Error(`Gateway responded with status ${verifyRes.status}`);
    const fetchedText = await verifyRes.text();
    if (fetchedText.trim() !== testContent.trim()) {
      throw new Error("Gateway returned incorrect data.");
    }
    report("verify", "success");

    return { success: true };
  } catch (e) {
    if (lastReportedStep) {
      report(lastReportedStep.step, "error", e.message);
    }
    throw new Error(
      `Test failed at step '${lastReportedStep?.step || "unknown"}': ${
        e.message
      }`
    );
  }
}
