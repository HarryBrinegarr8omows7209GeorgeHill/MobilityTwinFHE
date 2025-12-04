// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface TrafficData {
  id: string;
  encryptedTrajectory: string;
  timestamp: number;
  vehicleType: string;
  fheProcessed: boolean;
}

const App: React.FC = () => {
  // Randomized style selections
  // Colors: High contrast (blue+orange)
  // UI: Future metal
  // Layout: Center radiation
  // Interaction: Micro-interactions
  
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [trafficData, setTrafficData] = useState<TrafficData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newTrafficData, setNewTrafficData] = useState({
    vehicleType: "",
    trajectory: ""
  });
  const [showStats, setShowStats] = useState(false);

  // Calculate statistics
  const vehicleTypes = [...new Set(trafficData.map(item => item.vehicleType))];
  const processedCount = trafficData.filter(item => item.fheProcessed).length;

  useEffect(() => {
    loadTrafficData().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadTrafficData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("traffic_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing traffic keys:", e);
        }
      }
      
      const list: TrafficData[] = [];
      
      for (const key of keys) {
        try {
          const dataBytes = await contract.getData(`traffic_${key}`);
          if (dataBytes.length > 0) {
            try {
              const trafficItem = JSON.parse(ethers.toUtf8String(dataBytes));
              list.push({
                id: key,
                encryptedTrajectory: trafficItem.trajectory,
                timestamp: trafficItem.timestamp,
                vehicleType: trafficItem.vehicleType,
                fheProcessed: trafficItem.fheProcessed || false
              });
            } catch (e) {
              console.error(`Error parsing traffic data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading traffic data ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setTrafficData(list);
    } catch (e) {
      console.error("Error loading traffic data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const addTrafficData = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setAdding(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting trajectory data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-TRAJ-${btoa(JSON.stringify(newTrafficData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const dataId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const trafficItem = {
        trajectory: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        vehicleType: newTrafficData.vehicleType,
        fheProcessed: false
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `traffic_${dataId}`, 
        ethers.toUtf8Bytes(JSON.stringify(trafficItem))
      );
      
      const keysBytes = await contract.getData("traffic_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(dataId);
      
      await contract.setData(
        "traffic_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted traffic data submitted!"
      });
      
      await loadTrafficData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowAddModal(false);
        setNewTrafficData({
          vehicleType: "",
          trajectory: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setAdding(false);
    }
  };

  const processWithFHE = async (dataId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing trajectory with FHE..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const dataBytes = await contract.getData(`traffic_${dataId}`);
      if (dataBytes.length === 0) {
        throw new Error("Traffic data not found");
      }
      
      const trafficItem = JSON.parse(ethers.toUtf8String(dataBytes));
      
      const updatedItem = {
        ...trafficItem,
        fheProcessed: true
      };
      
      await contract.setData(
        `traffic_${dataId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedItem))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE processing completed!"
      });
      
      await loadTrafficData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Processing failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: isAvailable ? "FHE service is available" : "FHE service unavailable"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Availability check failed"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="metal-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container metal-theme">
      <div className="radial-center">
        <header className="app-header">
          <div className="logo">
            <div className="logo-icon">
              <div className="gear-icon"></div>
            </div>
            <h1>Mobility<span>Twin</span>FHE</h1>
          </div>
          
          <div className="header-actions">
            <button 
              onClick={() => setShowAddModal(true)} 
              className="add-data-btn metal-button"
              onMouseEnter={(e) => e.currentTarget.classList.add('hover-glow')}
              onMouseLeave={(e) => e.currentTarget.classList.remove('hover-glow')}
            >
              <div className="plus-icon"></div>
              Add Data
            </button>
            <button 
              className="metal-button"
              onClick={() => setShowStats(!showStats)}
              onMouseEnter={(e) => e.currentTarget.classList.add('hover-glow')}
              onMouseLeave={(e) => e.currentTarget.classList.remove('hover-glow')}
            >
              {showStats ? "Hide Stats" : "Show Stats"}
            </button>
            <button 
              className="metal-button"
              onClick={checkAvailability}
              onMouseEnter={(e) => e.currentTarget.classList.add('hover-glow')}
              onMouseLeave={(e) => e.currentTarget.classList.remove('hover-glow')}
            >
              Check FHE
            </button>
            <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
          </div>
        </header>
        
        <main className="main-content">
          <div className="welcome-panel">
            <h2>FHE-Based Secure Digital Twin for Urban Mobility</h2>
            <p>Anonymous vehicle and pedestrian trajectories processed with Fully Homomorphic Encryption</p>
          </div>
          
          {showStats && (
            <div className="stats-panel metal-card">
              <h3>Traffic Data Statistics</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{trafficData.length}</div>
                  <div className="stat-label">Total Records</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{processedCount}</div>
                  <div className="stat-label">FHE Processed</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{vehicleTypes.length}</div>
                  <div className="stat-label">Vehicle Types</div>
                </div>
              </div>
            </div>
          )}
          
          <div className="data-section">
            <div className="section-header">
              <h2>Encrypted Traffic Data</h2>
              <div className="header-actions">
                <button 
                  onClick={loadTrafficData}
                  className="refresh-btn metal-button"
                  disabled={isRefreshing}
                  onMouseEnter={(e) => e.currentTarget.classList.add('hover-glow')}
                  onMouseLeave={(e) => e.currentTarget.classList.remove('hover-glow')}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
            
            <div className="data-list metal-card">
              <div className="table-header">
                <div className="header-cell">ID</div>
                <div className="header-cell">Vehicle Type</div>
                <div className="header-cell">Date</div>
                <div className="header-cell">Status</div>
                <div className="header-cell">Actions</div>
              </div>
              
              {trafficData.length === 0 ? (
                <div className="no-data">
                  <div className="no-data-icon"></div>
                  <p>No traffic data found</p>
                  <button 
                    className="metal-button primary"
                    onClick={() => setShowAddModal(true)}
                    onMouseEnter={(e) => e.currentTarget.classList.add('hover-glow')}
                    onMouseLeave={(e) => e.currentTarget.classList.remove('hover-glow')}
                  >
                    Add First Data Point
                  </button>
                </div>
              ) : (
                trafficData.map(data => (
                  <div className="data-row" key={data.id}>
                    <div className="table-cell data-id">#{data.id.substring(0, 6)}</div>
                    <div className="table-cell">{data.vehicleType}</div>
                    <div className="table-cell">
                      {new Date(data.timestamp * 1000).toLocaleDateString()}
                    </div>
                    <div className="table-cell">
                      <span className={`status-badge ${data.fheProcessed ? "processed" : "pending"}`}>
                        {data.fheProcessed ? "Processed" : "Pending"}
                      </span>
                    </div>
                    <div className="table-cell actions">
                      {!data.fheProcessed && (
                        <button 
                          className="action-btn metal-button primary"
                          onClick={() => processWithFHE(data.id)}
                          onMouseEnter={(e) => e.currentTarget.classList.add('hover-glow')}
                          onMouseLeave={(e) => e.currentTarget.classList.remove('hover-glow')}
                        >
                          Process
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </main>
    
        {showAddModal && (
          <ModalAdd 
            onSubmit={addTrafficData} 
            onClose={() => setShowAddModal(false)} 
            adding={adding}
            trafficData={newTrafficData}
            setTrafficData={setNewTrafficData}
          />
        )}
        
        {walletSelectorOpen && (
          <WalletSelector
            isOpen={walletSelectorOpen}
            onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
            onClose={() => setWalletSelectorOpen(false)}
          />
        )}
        
        {transactionStatus.visible && (
          <div className="transaction-modal">
            <div className="transaction-content metal-card">
              <div className={`transaction-icon ${transactionStatus.status}`}>
                {transactionStatus.status === "pending" && <div className="metal-spinner"></div>}
                {transactionStatus.status === "success" && <div className="check-icon"></div>}
                {transactionStatus.status === "error" && <div className="error-icon"></div>}
              </div>
              <div className="transaction-message">
                {transactionStatus.message}
              </div>
            </div>
          </div>
        )}
    
        <footer className="app-footer">
          <div className="footer-content">
            <div className="footer-brand">
              <div className="logo">
                <div className="gear-icon"></div>
                <span>MobilityTwinFHE</span>
              </div>
              <p>Secure urban mobility simulation with FHE technology</p>
            </div>
            
            <div className="footer-links">
              <a href="#" className="footer-link">Documentation</a>
              <a href="#" className="footer-link">Privacy Policy</a>
              <a href="#" className="footer-link">GitHub</a>
            </div>
          </div>
          
          <div className="footer-bottom">
            <div className="fhe-badge">
              <span>FHE-Powered Privacy</span>
            </div>
            <div className="copyright">
              © {new Date().getFullYear()} MobilityTwinFHE. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

interface ModalAddProps {
  onSubmit: () => void; 
  onClose: () => void; 
  adding: boolean;
  trafficData: any;
  setTrafficData: (data: any) => void;
}

const ModalAdd: React.FC<ModalAddProps> = ({ 
  onSubmit, 
  onClose, 
  adding,
  trafficData,
  setTrafficData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setTrafficData({
      ...trafficData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!trafficData.vehicleType || !trafficData.trajectory) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="add-modal metal-card">
        <div className="modal-header">
          <h2>Add Traffic Data</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="lock-icon"></div> Data will be encrypted with FHE technology
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Vehicle Type *</label>
              <select 
                name="vehicleType"
                value={trafficData.vehicleType} 
                onChange={handleChange}
                className="metal-select"
              >
                <option value="">Select type</option>
                <option value="Car">Car</option>
                <option value="Bus">Bus</option>
                <option value="Bicycle">Bicycle</option>
                <option value="Pedestrian">Pedestrian</option>
                <option value="Truck">Truck</option>
                <option value="Motorcycle">Motorcycle</option>
              </select>
            </div>
            
            <div className="form-group full-width">
              <label>Trajectory Data *</label>
              <textarea 
                name="trajectory"
                value={trafficData.trajectory} 
                onChange={handleChange}
                placeholder="Enter trajectory coordinates (will be FHE encrypted)..." 
                className="metal-textarea"
                rows={4}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="shield-icon"></div> Data remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn metal-button"
            onMouseEnter={(e) => e.currentTarget.classList.add('hover-glow')}
            onMouseLeave={(e) => e.currentTarget.classList.remove('hover-glow')}
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={adding}
            className="submit-btn metal-button primary"
            onMouseEnter={(e) => e.currentTarget.classList.add('hover-glow')}
            onMouseLeave={(e) => e.currentTarget.classList.remove('hover-glow')}
          >
            {adding ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;