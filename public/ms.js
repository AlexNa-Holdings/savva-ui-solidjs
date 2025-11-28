document.addEventListener("DOMContentLoaded", () => {
  // --- CONTRACT DEFINITIONS ---
  const CONTRACT_DEFINITIONS = {
    config: {
      displayName: "Config",
      address: "0x4ED8321722ACB984aB6B249C4AE74a58CAD7E4e8",
      abi: [
        "function setAddr(bytes32 name, address value)",
        "function setUInt(bytes32 name, uint256 value)",
        "function getAddr(bytes32 name) public view returns (address)",
        "function getUInt(bytes32 name) public view returns (uint256)",
      ],
      params: [
        { name: "authorShare", type: "uint", units: "% * 100" },
        { name: "nftOwnerCut", type: "uint", units: "% * 100" },
        { name: "minContribution", type: "uint", units: "SAVVA" },
        { name: "timeForRound", type: "uint", units: "seconds" },
        { name: "winnerShare", type: "uint", units: "%" },
        { name: "minFundToShare", type: "uint", units: "SAVVA" },
        { name: "staking_withdraw_delay", type: "uint", units: "seconds" },
        { name: "contentNFT_mintPrice", type: "uint", units: "PLS" },
        { name: "pulsex_slippage", type: "uint", units: "%" },
        { name: "min_staked_to_post", type: "uint", units: "SAVVA" },
        { name: "sac_min_deposit", type: "uint", units: "PLS" },
        { name: "patron_payment_period", type: "uint", units: "seconds" },
        { name: "gov_proposal_price", type: "uint", units: "PLS" },
        { name: "nft_auction_max_duration", type: "uint", units: "seconds" },
        { name: "nft_auction_min_increment", type: "uint", units: "%" },
        { name: "nft_auction_max_increment", type: "uint", units: "%" },
        { name: "min_staked_for_nft_auction", type: "uint", units: "SAVVA" },
        { name: "min_staked_for_fundrasing", type: "uint", units: "SAVVA" },
        { name: "fundraising_bb_fee", type: "uint", units: "% * 100" },
        { name: "authorsClubsGainReceiver", type: "address" },
        { name: "pulsex_factory", type: "address" },
        { name: "pulsex_router", type: "address" },
        { name: "pulsex_router_version", type: "uint" },
        { name: "WPLS", type: "address" },
        { name: "contract_savvaToken", type: "address" },
        { name: "contract_randomOracle", type: "address" },
        { name: "contract_staking", type: "address" },
        { name: "contract_userProfile", type: "address" },
        { name: "contract_contentNFT", type: "address" },
        { name: "contract_contentFund", type: "address" },
        { name: "contract_governance", type: "address" },
        { name: "contract_contentRegistry", type: "address" },
        { name: "contract_savvaFaucet", type: "address" },
        { name: "contract_nftMarketplace", type: "address" },
        { name: "contract_promo", type: "address" },
        { name: "contract_buyBurn", type: "address" },
        { name: "contract_listMarket", type: "address" },
        { name: "contract_authorOfTheMonth", type: "address" },
        { name: "contract_authorsClubs", type: "address" },
        { name: "contract_nftAuction", type: "address" },
        { name: "contract_fundraiser", type: "address" },
        { name: "contract_savvaSwap", type: "address" },
      ],
    },
    randomOracle: {
      displayName: "Random Oracle",
      address: "",
      abi: [
        "function addUpdater(address _updater)",
        "function removeUpdater(address _updater)",
        "function isUpdater(address _updater) public view returns (bool)",
      ],
      params: [
        {
          name: "addUpdater",
          type: "address",
          units: "address",
          method: "addUpdater",
        },
        {
          name: "removeUpdater",
          type: "address",
          units: "address",
          method: "removeUpdater",
        },
      ],
    },
  };

  const SAFE_ABI = [
    "function getOwners() public view returns (address[] memory)",
    "function getThreshold() public view returns (uint256)",
    "function nonce() public view returns (uint256)",
    "function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes calldata signatures) external payable returns (bool success)",
    "function getTransactionHash(address to, uint256 value, bytes memory data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) public view returns (bytes32)",
  ];

  // --- State Variables ---
  let provider, signer, connectedAccount;
  const state = {
    contracts: {},
    safeContract: null,
  };

  // --- DOM Elements ---
  const settingsGrid = document.getElementById("settings-grid");
  const connectWalletBtn = document.getElementById("connectWalletBtn");
  const saveSettingsBtn = document.getElementById("saveSettingsBtn");
  const walletInfoDiv = document.getElementById("walletInfo");
  const statusLogDiv = document.getElementById("status-log");
  const logContent = document.getElementById("log-content");
  const ownersSection = document.getElementById("owners-section");
  const ownersList = document.getElementById("ownersList");
  const ownerWarning = document.getElementById("owner-warning");
  const safeThresholdSpan = document.getElementById("safeThreshold");
  const connectionDot = document.getElementById("connection-dot");
  const connectionText = document.getElementById("connection-text");
  const tabsContainer = document.getElementById("tabs-container");
  const panelsContainer = document.getElementById("panels-container");

  // --- Initialization ---
  const init = () => {
    setupSettingsInputs();
    setupTabsAndPanels();
    connectWalletBtn.addEventListener("click", connectWallet);
    saveSettingsBtn.addEventListener("click", saveSettings);

    // Auto-save Safe address on change
    document.getElementById("safeAddress").addEventListener("input", (e) => {
      localStorage.setItem("safeAddress", e.target.value);
    });

    // Auto-save chain ID on change
    document.getElementById("chainId").addEventListener("change", (e) => {
      localStorage.setItem("targetChainId", e.target.value);
    });

    if (window.ethereum && window.ethereum.selectedAddress) {
      connectWallet();
    }
  };

  const setupSettingsInputs = () => {
    // Find the grid where dynamic contract inputs will go
    const dynamicContractsContainer = document.getElementById("settings-grid");

    // Dynamically add inputs for each contract
    for (const key in CONTRACT_DEFINITIONS) {
      const contract = CONTRACT_DEFINITIONS[key];
      const div = document.createElement("div");

      // Make the Config contract span both columns if it's the first one
      if (key === "config") {
        div.className = "md:col-span-2";
      }

      div.innerHTML = `
            <label for="${key}Address" class="block mb-2 font-semibold">${contract.displayName} Address</label>
            <input type="text" id="${key}Address" class="input-field" placeholder="0x...">
        `;

      dynamicContractsContainer.appendChild(div);

      // After adding to DOM, set value from localStorage or default
      const input = document.getElementById(`${key}Address`);
      input.value =
        localStorage.getItem(`${key}Address`) || contract.address || "";
    }

    // Load static settings
    document.getElementById("safeAddress").value =
      localStorage.getItem("safeAddress") || "";
    document.getElementById("chainId").value =
      localStorage.getItem("targetChainId") || "369"; // Default to PulseChain
  };

  const setupTabsAndPanels = () => {
    let first = true;
    for (const key in CONTRACT_DEFINITIONS) {
      const contract = CONTRACT_DEFINITIONS[key];
      const tab = document.createElement("button");
      tab.className = `tab ${first ? "active" : ""}`;
      tab.textContent = contract.displayName;
      tab.dataset.tabTarget = `#panel-${key}`;
      tab.addEventListener("click", () => {
        document
          .querySelectorAll(".tab")
          .forEach((t) => t.classList.remove("active"));
        document
          .querySelectorAll(".tab-content")
          .forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        document.querySelector(tab.dataset.tabTarget).classList.add("active");
      });
      tabsContainer.appendChild(tab);

      const panel = document.createElement("div");
      panel.id = `panel-${key}`;
      panel.className = `tab-content space-y-4 ${first ? "active" : ""}`;
      panelsContainer.appendChild(panel);
      populatePanel(key);
      first = false;
    }
  };

  const populatePanel = (contractKey) => {
    const panel = document.getElementById(`panel-${contractKey}`);
    const contract = CONTRACT_DEFINITIONS[contractKey];
    panel.innerHTML = "";
    contract.params.forEach((param) => {
      const isAddress = param.type === "address";
      const inputType = isAddress ? "text" : "text"; // Use text for all for easier BigInt handling
      const step =
        param.units &&
        (param.units.includes("SAVVA") || param.units.includes("PLS"))
          ? "any"
          : "1";
      const card = document.createElement("div");
      card.className =
        "card grid grid-cols-1 md:grid-cols-3 gap-4 items-center";
      card.innerHTML = `
                <div>
                    <label for="${contractKey}-param-${
        param.name
      }" class="font-bold text-lg">${param.name}</label>
                    ${
                      param.units
                        ? `<p class="text-sm text-gray-400">Units: ${param.units}</p>`
                        : ""
                    }
                </div>
                <div class="md:col-span-2 flex items-center gap-2">
                     <input type="${inputType}" step="${step}" id="${contractKey}-param-${
        param.name
      }" class="input-field flex-grow" placeholder="Loading...">
                     <button data-contract-key="${contractKey}" data-param-name="${
        param.name
      }" class="btn btn-secondary update-btn">Propose Update</button>
                </div>
            `;
      panel.appendChild(card);
    });
  };

  const logStatus = (message, isError = false) => {
    statusLogDiv.classList.remove("hidden");
    const timestamp = new Date().toLocaleTimeString();
    const newLog = document.createElement("div");
    newLog.textContent = `[${timestamp}] ${message}`;
    newLog.className = isError ? "text-red-500" : "text-gray-300";
    logContent.prepend(newLog);
  };

  const saveSettings = () => {
    localStorage.setItem(
      "safeAddress",
      document.getElementById("safeAddress").value
    );
    localStorage.setItem(
      "targetChainId",
      document.getElementById("chainId").value
    );
    for (const key in CONTRACT_DEFINITIONS) {
      const addressVal = document.getElementById(`${key}Address`).value;
      if (ethers.utils.isAddress(addressVal) || addressVal === "") {
        localStorage.setItem(`${key}Address`, addressVal);
      }
    }
    logStatus("Settings saved to browser storage.");
    location.reload();
  };

  const updateConnectionStatus = (isConnected, networkOk, message) => {
    connectionText.textContent = message;
    connectionDot.className = "status-dot ";
    if (!isConnected) {
      connectionDot.classList.add("bg-gray-500");
    } else if (networkOk) {
      connectionDot.classList.add("bg-teal-500");
    } else {
      connectionDot.classList.add("bg-red-500");
    }
  };

  // Network configurations for wallet_addEthereumChain
  const NETWORK_CONFIGS = {
    369: {
      chainId: "0x171",
      chainName: "PulseChain",
      nativeCurrency: { name: "PLS", symbol: "PLS", decimals: 18 },
      rpcUrls: ["https://rpc.pulsechain.com"],
      blockExplorerUrls: ["https://scan.pulsechain.com"],
    },
    1: {
      chainId: "0x1",
      chainName: "Ethereum Mainnet",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: ["https://eth.llamarpc.com"],
      blockExplorerUrls: ["https://etherscan.io"],
    },
    8453: {
      chainId: "0x2105",
      chainName: "Base",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: ["https://mainnet.base.org"],
      blockExplorerUrls: ["https://basescan.org"],
    },
  };

  const switchNetwork = async (targetChainId) => {
    const hexChainId = "0x" + targetChainId.toString(16);
    try {
      // Try to switch to the network
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexChainId }],
      });
      return true;
    } catch (switchError) {
      // Error 4902 means the chain is not added to the wallet
      if (switchError.code === 4902) {
        const networkConfig = NETWORK_CONFIGS[targetChainId];
        if (networkConfig) {
          try {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [networkConfig],
            });
            return true;
          } catch (addError) {
            logStatus(`Failed to add network: ${addError.message}`, true);
            return false;
          }
        }
      }
      logStatus(`Failed to switch network: ${switchError.message}`, true);
      return false;
    }
  };

  // --- Wallet and Contract Interaction ---
  const connectWallet = async () => {
    try {
      if (!window.ethereum)
        throw new Error(
          "Wallet not detected! Please install MetaMask or a similar wallet."
        );

      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      connectedAccount = ethers.utils.getAddress(accounts[0]);

      const walletProvider = new ethers.providers.Web3Provider(window.ethereum);
      signer = walletProvider.getSigner();

      provider = walletProvider;

      const network = await provider.getNetwork();
      const targetChainId = parseInt(
        document.getElementById("chainId").value,
        10
      );

      if (network.chainId !== targetChainId) {
        const selectedOption =
          document.getElementById("chainId").options[
            document.getElementById("chainId").selectedIndex
          ];
        const targetNetworkName = selectedOption.text;
        logStatus(`Wrong network. Switching to ${targetNetworkName}...`);

        const switched = await switchNetwork(targetChainId);
        if (switched) {
          // Re-initialize provider after network switch
          const newProvider = new ethers.providers.Web3Provider(window.ethereum);
          provider = newProvider;
          signer = newProvider.getSigner();
          const newNetwork = await newProvider.getNetwork();

          if (newNetwork.chainId === targetChainId) {
            logStatus(`Successfully switched to ${targetNetworkName}`);
          } else {
            const message = `Failed to switch network. Still on ${newNetwork.name}.`;
            updateConnectionStatus(true, false, message);
            logStatus(message, true);
            walletInfoDiv.innerHTML = `<span class="text-red-500">${message}</span>`;
            return;
          }
        } else {
          const message = `Could not switch to ${targetNetworkName}. Please switch manually in your wallet.`;
          updateConnectionStatus(true, false, message);
          logStatus(message, true);
          walletInfoDiv.innerHTML = `<span class="text-red-500">${message}</span>`;
          return;
        }
      }

      const currentNetwork = await provider.getNetwork();
      walletInfoDiv.textContent = `Connected: ${connectedAccount}`;
      updateConnectionStatus(true, true, `Connected to ${currentNetwork.name}`);
      logStatus(
        `Wallet connected: ${connectedAccount} on network ${currentNetwork.name}.`
      );
      connectWalletBtn.textContent = "Wallet Connected";
      connectWalletBtn.disabled = true;

      await initializeContracts();
    } catch (error) {
      const message = `Error connecting wallet: ${error.message}`;
      updateConnectionStatus(false, false, "Connection Failed");
      logStatus(message, true);
      console.error(error);
    }
  };

  const initializeContracts = async () => {
    const safeAddr = document.getElementById("safeAddress").value;
    if (!ethers.utils.isAddress(safeAddr)) {
      logStatus("Error: Invalid Gnosis Safe address provided.", true);
      return;
    }
    state.safeContract = new ethers.Contract(safeAddr, SAFE_ABI, signer);

    for (const key in CONTRACT_DEFINITIONS) {
      const contractAddr = document.getElementById(`${key}Address`).value;
      if (ethers.utils.isAddress(contractAddr)) {
        state.contracts[key] = new ethers.Contract(
          contractAddr,
          CONTRACT_DEFINITIONS[key].abi,
          signer
        );
      } else {
        logStatus(
          `Warning: Invalid address for ${CONTRACT_DEFINITIONS[key].displayName}. Its panel will not be functional.`,
          true
        );
      }
    }

    logStatus("Contracts initialized. Fetching Safe details...");
    await displaySafeDetails();
    await fetchAndDisplayAllParams();
  };

  const displaySafeDetails = async () => {
    if (!state.safeContract) return;
    try {
      const [owners, threshold] = await Promise.all([
        state.safeContract.getOwners(),
        state.safeContract.getThreshold(),
      ]);

      safeThresholdSpan.textContent = threshold.toString();
      let isOwner = false;
      ownersList.innerHTML = "";
      owners.forEach((owner) => {
        const li = document.createElement("li");
        li.textContent = owner;
        li.className = "font-mono";
        if (owner.toLowerCase() === connectedAccount.toLowerCase()) {
          isOwner = true;
          li.innerHTML += ' <span class="text-teal-500 font-bold">(You)</span>';
        }
        ownersList.appendChild(li);
      });

      ownersSection.classList.remove("hidden");
      if (isOwner) {
        ownerWarning.classList.add("hidden");
      } else {
        ownerWarning.classList.remove("hidden");
      }
    } catch (error) {
      logStatus(`Error fetching Safe details: ${error.message}`, true);
      console.error(error);
    }
  };

  const fetchAndDisplayAllParams = async () => {
    logStatus("Fetching current parameter values...");

    for (const key in CONTRACT_DEFINITIONS) {
      const contract = state.contracts[key];
      if (!contract) {
        logStatus(`Skipping ${key} — not initialized`, true);
        continue;
      }

      logStatus(`Fetching parameters for ${key}...`);

      for (const param of CONTRACT_DEFINITIONS[key].params) {
        const inputEl = document.getElementById(`${key}-param-${param.name}`);
        const buttonEl = document.querySelector(
          `button[data-contract-key="${key}"][data-param-name="${param.name}"]`
        );

        // Attach the click handler
        buttonEl.addEventListener("click", handleUpdateClick);

        // Fetch values only for the 'config' contract
        if (key === "config") {
          await fetchAndDisplayParam(key, param);
        } else {
          // All other contracts (like randomOracle) get placeholders only
          inputEl.placeholder =
            param.type === "address" ? "0x..." : "Enter value";
        }
      }
    }

    logStatus("All current values loaded.");
  };

  const fetchAndDisplayParam = async (contractKey, param) => {
    const inputEl = document.getElementById(
      `${contractKey}-param-${param.name}`
    );
    const buttonEl = document.querySelector(
      `button[data-contract-key="${contractKey}"][data-param-name="${param.name}"]`
    );

    try {
      const contract = state.contracts[contractKey];

      const functionName =
        contractKey === "config"
          ? param.type === "address"
            ? "getAddr"
            : "getUInt" // 👈 Make sure this matches your ABI exactly
          : param.type === "address"
          ? "configAddr"
          : "configUint";

      if (typeof contract[functionName] !== "function") {
        throw new Error(
          `Function ${functionName} is not available on ${contractKey}`
        );
      }

      const currentValue = await contract[functionName](
        ethers.utils.formatBytes32String(param.name)
      );

      inputEl.value = formatUintValue(currentValue, param.units);
    } catch (error) {
      console.error(`Error in fetchAndDisplayParam for ${param.name}:`, error); // 👈 Ensure this is shown
      logStatus(`Error fetching '${param.name}': ${error.message}`, true);
      inputEl.placeholder = "Error fetching value";
      inputEl.disabled = true;
      buttonEl.disabled = true;
    }
  };

  const formatUintValue = (value, units = "") => {
    if (!value) return "0";
    if (units.includes("SAVVA") || units.includes("PLS")) {
      return ethers.utils.formatEther(value);
    }
    if (units.includes("% * 100")) {
      return ethers.BigNumber.from(value).toNumber() / 100;
    }
    return value.toString();
  };

  const parseInputValue = (value, units = "") => {
    if (units.includes("SAVVA") || units.includes("PLS")) {
      return ethers.utils.parseEther(value);
    }
    if (units.includes("% * 100")) {
      return ethers.BigNumber.from(Math.round(parseFloat(value) * 100));
    }
    return ethers.BigNumber.from(value);
  };

  const handleUpdateClick = async (event) => {
    event.target.disabled = true;
    event.target.textContent = "Proposing...";

    const contractKey = event.target.dataset.contractKey;
    const paramName = event.target.dataset.paramName;

    const contractDef = CONTRACT_DEFINITIONS[contractKey];
    const param = contractDef.params.find((p) => p.name === paramName);
    if (!param) {
      event.target.disabled = false;
      event.target.textContent = "Update";
      return;
    }

    const contract = state.contracts[contractKey];
    if (!contract || !state.safeContract) {
      logStatus(
        "Error: Contracts not initialized. Connect wallet first.",
        true
      );
      event.target.disabled = false;
      event.target.textContent = "Update";
      return;
    }

    const inputEl = document.getElementById(
      `${contractKey}-param-${param.name}`
    );
    const value = inputEl.value.trim();

    if (!value) {
      logStatus(`Error: No value provided for '${param.name}'.`, true);
      event.target.disabled = false;
      event.target.textContent = "Update";
      return;
    }

    logStatus(
      `Preparing update for '${contractDef.displayName} -> ${param.name}' with value '${value}'...`
    );

    try {
      const contractInterface = new ethers.utils.Interface(contractDef.abi);
      let calldata;
      const methodName =
        param.method || (param.type === "address" ? "setAddr" : "setUInt");

      if (param.type === "address") {
        if (!ethers.utils.isAddress(value)) {
          throw new Error("Invalid address format.");
        }
        const args = param.method
          ? [value]
          : [ethers.utils.formatBytes32String(param.name), value];
        calldata = contractInterface.encodeFunctionData(methodName, args);
      } else {
        const parsedValue = parseInputValue(value, param.units);
        const args = param.method
          ? [parsedValue]
          : [ethers.utils.formatBytes32String(param.name), parsedValue];
        calldata = contractInterface.encodeFunctionData(methodName, args);
      }

      logStatus(`Encoded calldata: ${calldata.substring(0, 50)}...`);

      const safeTxNonce = await state.safeContract.nonce();
      logStatus(
        `Current Safe nonce is ${safeTxNonce}. Creating transaction proposal.`
      );

      // This is a simplified call for proposing. Gnosis Safe UIs often build more complex meta-transactions.
      // This direct `execTransaction` call will work if the connected signer is an owner and has permissions.
      const tx = await state.safeContract.execTransaction(
        contract.address,
        0,
        calldata,
        0,
        0,
        0,
        0,
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        `0x000000000000000000000000${(
          await signer.getAddress()
        ).slice(
          2
        )}000000000000000000000000000000000000000000000000000000000000000001`
      );

      logStatus(`Transaction proposed to Safe. Tx Hash: ${tx.hash}`);
      await tx.wait();
      logStatus(
        `Transaction proposal confirmed on-chain for '${param.name}'. Check your Safe UI to collect signatures and execute.`
      );
    } catch (error) {
      const message =
        error.reason ||
        error.data?.message ||
        error.message ||
        "An unknown error occurred.";
      logStatus(`Error submitting transaction: ${message}`, true);
      console.error(error);
    } finally {
      event.target.disabled = false;
      event.target.textContent = "Update";
    }
  };

  init();
});
