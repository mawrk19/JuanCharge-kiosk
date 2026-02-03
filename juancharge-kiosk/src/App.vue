<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { Zap, Download, Gift, Cable, ArrowLeft, CheckCircle, Activity } from 'lucide-vue-next'
import Swal from 'sweetalert2'
import PointsDisplay from './components/PointsDisplay.vue'
import StorePointView from './components/StorePointView.vue'
import RedeemView from './components/RedeemView.vue'
import ChargingProgress from './components/ChargingProgress.vue'
import { QrCode } from 'lucide-vue-next'

const currentView = ref('home') // home, selectPort, confirmation, storePoint, redeem, charging
const selectedPort = ref(null)
const pointsDisplayRef = ref(null)
const storedQrData = ref('')
const storedPoints = ref(0)
const portStatuses = ref([null, null, null]) // Status for ports 1, 2, 3
const currentPoints = ref(0)
const chargingDuration = ref(0)
const kioskCode = ref('UCC-Kiosk-0001')
let statusInterval = null

// Poll port statuses
const updatePortStatuses = async () => {
  try {
    if (window.electronAPI) {
      const result = await window.electronAPI.invoke('get-charging-status')
      if (result.success && result.statuses) {
        portStatuses.value = result.statuses
      }
    }
  } catch (error) {
    console.error('Error getting port statuses:', error)
  }
}

// Get current points
const updateCurrentPoints = async () => {
  if (pointsDisplayRef.value && pointsDisplayRef.value.points !== undefined) {
    currentPoints.value = pointsDisplayRef.value.points
  }
}

// Ensure ref is available even when component is conditionally rendered
onMounted(async () => {
  await nextTick()
  console.log('PointsDisplay ref available:', !!pointsDisplayRef.value)
  
  // Register event listener for real-time charging status updates
  if (window.electronAPI && typeof window.electronAPI.on === 'function') {
    window.electronAPI.on('charging-status-changed', (data) => {
      console.log('[CHARGING EVENT] Received status update:', data);
      if (data && data.statuses) {
        portStatuses.value = data.statuses;
      }
    });
    console.log('✅ Registered charging-status-changed event listener');
  }
  
  // Initial status fetch
  updatePortStatuses()
  
  // Fetch kiosk config
  if (window.electronAPI) {
    window.electronAPI.invoke('get-kiosk-config').then(config => {
      if (config && config.kiosk_code) {
        kioskCode.value = config.kiosk_code
      }
    })
  }

  // Reduced polling to 10 seconds as fallback (events handle real-time updates)
  statusInterval = setInterval(updatePortStatuses, 1000) // Fast polling in dev? Actually 10s is fine.
})

onUnmounted(() => {
  if (statusInterval) {
    clearInterval(statusInterval)
  }
})

function goToUseNow() {
  updateCurrentPoints()
  currentView.value = 'selectPort'
}

function goToRedeem() {
  currentView.value = 'redeem'
}

const goToStorePoint = async () => {
  await updateCurrentPoints() // Ensure we have latest points
  
  if (currentPoints.value <= 0) {
    Swal.fire({
      title: 'No Points',
      text: 'You do not have any points to store.',
      icon: 'warning',
      background: '#ffffff',
      color: '#0f172a'
    });
    return;
  }
  
  storedPoints.value = currentPoints.value
  
  try {
    if (window.electronAPI) {
      const result = await window.electronAPI.invoke('generate-signed-voucher', {
        amount: storedPoints.value
      })
      
      if (result.success) {
        storedQrData.value = result.token
        currentView.value = 'storePoint'
      } else {
        console.error('Failed to generate token:', result.error)
        alert('Failed to generate secure voucher. Please try again.')
      }
    } else {
      // Fallback for browser testing
      const data = {
        action: 'store_points',
        amount: storedPoints.value,
        timestamp: Date.now(),
        mock: true
      }
      storedQrData.value = JSON.stringify(data)
      
      // Clear mock storage
      localStorage.setItem('juancharge-mock-points', '0')
      
      currentView.value = 'storePoint'
    }
  } catch (err) {
    console.error('Error in goToStorePoint:', err)
    alert('An unexpected error occurred.')
  }
}
  
async function selectPort(portNumber) {
  selectedPort.value = portNumber
  
  // Get current points
  await updateCurrentPoints()
  
  if (currentPoints.value <= 0) {
    alert('No points available!')
    return
  }
  
  // Check if port is already in use
  const portStatus = portStatuses.value.find(s => s && s.port === portNumber)
  if (portStatus && portStatus.active) {
    alert(`Port ${portNumber} is currently in use!`)
    return
  }
  
  // Activate charging
  try {
    const result = await window.electronAPI.invoke('activate-charging', {
      port: portNumber,
      points: currentPoints.value
    })
    
    if (result.success) {
      // Force refresh points display
      if (pointsDisplayRef.value && pointsDisplayRef.value.refreshPoints) {
        await pointsDisplayRef.value.refreshPoints()
        console.log('Points refreshed after charging activation')
      }
      
      // Update current points immediately
      await updateCurrentPoints()
      
      // Show success message
      const minutes = Math.floor(result.durationSeconds / 60)
      alert(`✅ Charging started on Port ${portNumber}!\n\nDuration: ${minutes} minutes\n\nYou can now use other ports or redeem more points.`)
      
      // Return to home immediately so user can use other ports
      currentView.value = 'home'
    } else {
      alert(result.error || 'Unable to start charging. Please consult technicians or personnel.')
    }
  } catch (error) {
    console.error('Error activating charging:', error)
    alert('Unable to start charging. Please consult technicians or personnel.')
  }
}

function resetToHome() {
  currentView.value = 'home'
  selectedPort.value = null
  storedQrData.value = ''
  storedPoints.value = 0
  chargingDuration.value = 0
  
  // Refresh points when returning home
  if (pointsDisplayRef.value && pointsDisplayRef.value.refreshPoints) {
    pointsDisplayRef.value.refreshPoints()
  }
}

async function onChargingComplete() {
  // Refresh points before returning home
  if (pointsDisplayRef.value && pointsDisplayRef.value.refreshPoints) {
    await pointsDisplayRef.value.refreshPoints()
  }
  resetToHome()
}

async function onRedeemComplete() {
  // Refresh points after redemption
  if (pointsDisplayRef.value && pointsDisplayRef.value.refreshPoints) {
    await pointsDisplayRef.value.refreshPoints()
  }
  resetToHome()
}

// Helper to format seconds to time string
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  
  // Always show HH:MM:SS format with zero-padding
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

// Get port button class
function getPortButtonClass(portNumber) {
  const portStatus = portStatuses.value.find(s => s && s.port === portNumber)
  
  if (portStatus && portStatus.active) {
    return 'port-card in-use'
  }
  
  if (currentPoints.value <= 0) {
    return 'port-card no-points'
  }
  
  return 'port-card available'
}

// Get port button text
function getPortButtonText(portNumber) {
  const portStatus = portStatuses.value.find(s => s && s.port === portNumber)
  
  if (portStatus && portStatus.active) {
    return {
      status: 'In Use',
      subtext: `${formatTime(portStatus.remainingSeconds)} left`
    }
  }
  
  if (currentPoints.value <= 0) {
    return {
      status: 'No Points',
      subtext: 'Scan manual to earn'
    }
  }
  
  return {
    status: 'Available',
    subtext: `~${formatTime(currentPoints.value * 60)} charge`
  }
}

// Check if port is disabled
function isPortDisabled(portNumber) {
  const portStatus = portStatuses.value.find(s => s && s.port === portNumber)
  return (portStatus && portStatus.active) || currentPoints.value <= 0
}
</script>

<template>
  <div class="app-layout">
    <!-- Header -->
    <header class="app-header glass-panel">
      <div class="logo-area">
        <h1 class="app-title"><span class="text-gradient">Juan</span>Charge</h1>
      </div>
      <div v-if="portStatuses.some(p => p && p.active)" class="active-status-badge">
        <Activity :size="16" class="status-icon pulse" />
        {{ portStatuses.filter(p => p && p.active).length }} Active Sessions
      </div>
    </header>

    <!-- Main Content -->
    <main class="app-content">
      <Transition name="fade" mode="out-in">
        <!-- Home View -->
        <div v-if="currentView === 'home'" class="view-container home-view" key="home">
          <!-- Hero / Points Section -->
          <div class="hero-section">
            <PointsDisplay ref="pointsDisplayRef" />
          </div>
          
          <!-- Quick Status Check (Only if active sessions exist) -->
          <div v-if="portStatuses.some(p => p && p.active)" class="status-summary glass-panel">
            <h3 class="section-label">Active Port Status</h3>
            <div class="mini-status-grid">
              <div 
                v-for="status in portStatuses.filter(p => p && p.active)" 
                :key="status.port" 
                class="mini-status-item"
              >
                <div class="port-id">Port {{ status.port }}</div>
                <div class="port-timer">{{ formatTime(status.remainingSeconds) }}</div>
              </div>
            </div>
          </div>
          
          <!-- Primary Actions -->
          <div class="action-grid">
            <button class="action-card primary glass-panel" @click="goToUseNow">
              <div class="icon-wrapper"><Zap :size="48" /></div>
              <div class="card-content">
                <span class="card-title">Use Points</span>
                <span class="card-desc">Start Charging</span>
              </div>
            </button>
            
            <button class="action-card secondary glass-panel" @click="goToStorePoint">
              <div class="icon-wrapper"><Download :size="48" /></div>
              <div class="card-content">
                <span class="card-title">Store Points</span>
                <span class="card-desc">Save for later</span>
              </div>
            </button>
          </div>
        </div>
        
        <!-- Select Port View -->
        <div v-else-if="currentView === 'selectPort'" class="view-container select-port-view" key="selectPort">
          <h2 class="view-title">Select Charging Port</h2>
          
          <div class="ports-grid">
            <button 
              v-for="port in [1, 2, 3]" 
              :key="port"
              :class="['port-card glass-panel', getPortButtonClass(port)]" 
              @click="selectPort(port)"
              :disabled="isPortDisabled(port)"
            >
              <div class="port-icon-wrapper">
                <div class="cable-icon"><Cable :size="40" /></div>
              </div>
              <div class="port-info">
                <span class="port-number">Port {{ port }}</span>
                <span class="port-status">{{ getPortButtonText(port).status }}</span>
                <span class="port-subtext">{{ getPortButtonText(port).subtext }}</span>
              </div>
            </button>
          </div>
          
          <button class="back-btn" @click="resetToHome">
            <ArrowLeft :size="20" class="arrow" /> Back
          </button>
        </div>

        <!-- Confirmation View -->
        <div v-else-if="currentView === 'confirmation'" class="view-container centered-view" key="confirmation">
          <div class="success-card glass-panel">
            <div class="checkmark-circle"><CheckCircle :size="80" color="#38ef7d" /></div>
            <h2 class="success-title">Ready to Charge</h2>
            <p class="success-msg">Port {{ selectedPort }} is now active.</p>
          </div>
        </div>

        <!-- Store Point View -->
        <div v-else-if="currentView === 'storePoint'" class="view-container centered-view" key="storePoint">
          <StorePointView 
            :qrData="storedQrData" 
            :points="storedPoints" 
            @done="resetToHome"
            @cancel="resetToHome"
          />
        </div>
        
        <!-- Redeem View -->
        <div v-else-if="currentView === 'redeem'" class="view-container centered-view" key="redeem">
          <RedeemView @complete="onRedeemComplete" />
        </div>
        
        <!-- Charging Progress View -->
        <div v-else-if="currentView === 'charging'" class="view-container centered-view" key="charging">
          <ChargingProgress 
            :port="selectedPort" 
            :totalSeconds="chargingDuration"
            @complete="onChargingComplete" 
          />
        </div>
      </Transition>
    </main>

    <!-- Hidden PointsDisplay for ref access -->
    <PointsDisplay 
      v-if="currentView !== 'home'" 
      ref="pointsDisplayRef" 
      class="points-hidden" 
    />
    

    <!-- Background Decor -->
    <div class="bg-gradient-orb orb-1"></div>
    <div class="bg-gradient-orb orb-2"></div>
  </div>
</template>

<style scoped>
.app-layout {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  z-index: 1;
}

/* Background & Decor */
.bg-gradient-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  z-index: -1;
  opacity: 0.4;
}
.orb-1 {
  width: 400px;
  height: 400px;
  background: var(--primary);
  top: -100px;
  left: -100px;
  animation: float 20s infinite ease-in-out;
}
.orb-2 {
  width: 500px;
  height: 500px;
  background: var(--secondary);
  bottom: -150px;
  right: -150px;
  animation: float 25s infinite ease-in-out reverse;
}

@keyframes float {
  0% { transform: translate(0, 0); }
  50% { transform: translate(30px, 50px); }
  100% { transform: translate(0, 0); }
}

/* Header */
.app-header {
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 40px;
  margin: 20px 20px 0 20px;
  z-index: 10;
}

.app-title {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -1px;
}

.active-status-badge {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(17, 153, 142, 0.1);
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--primary);
  border: 1px solid var(--primary);
}

.status-dot {
  width: 8px;
  height: 8px;
  background: var(--secondary);
  border-radius: 50%;
  box-shadow: 0 0 10px var(--secondary);
}

.pulse {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 0.5; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.1); }
  100% { opacity: 0.5; transform: scale(0.9); }
}

/* Content Area */
.app-content {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  position: relative;
}

.view-container {
  width: 100%;
  max-width: 1000px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 30px;
}

/* Home View */
.home-view {
  margin-top: 0; /* Remove negative adjustment to prevent overlap */
}

.hero-section {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
  width: 100%;
}

.action-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  color: var(--text-main);
  background: white;
  cursor: pointer;
  transition: all 0.3s var(--ease-spring);
  text-align: center;
  height: 220px;
  box-shadow: var(--shadow-lg);
}

.action-card:hover {
  transform: translateY(-5px);
  background: var(--surface-glass-strong);
  border-color: rgba(255, 255, 255, 0.3);
  box-shadow: var(--shadow-neon);
}

.action-card:active {
  transform: scale(0.98);
}

.action-card.primary {
  border-color: rgba(17, 153, 142, 0.4);
}

.action-card.primary:hover {
  box-shadow: 0 0 30px rgba(17, 153, 142, 0.4);
}

.icon-wrapper {
  font-size: 3.5rem;
  margin-bottom: 20px;
  filter: drop-shadow(0 0 10px rgba(255,255,255,0.3));
}

.card-title {
  display: block;
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 5px;
}

.card-desc {
  display: block;
  font-size: 0.9rem;
  color: var(--text-muted);
}

/* Status Summary */
.status-summary {
  width: 100%;
  padding: 20px;
  margin-bottom: 20px;
}

.section-label {
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin-bottom: 15px;
}

.mini-status-grid {
  display: flex;
  gap: 15px;
}

.mini-status-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--text-main);
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--secondary);
}

.port-id {
  font-weight: 600;
  color: white;
}

.port-timer {
  font-family: monospace;
  color: var(--secondary);
}

/* Select Port View */
.view-title {
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: 20px;
}

.ports-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  width: 100%;
}

.port-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px;
  height: 250px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.3s ease;
  color: var(--text-main);
  position: relative;
  overflow: hidden;
  background: white;
}

.port-card.available {
  border-color: var(--secondary);
  background: linear-gradient(135deg, rgba(56, 239, 125, 0.1) 0%, rgba(255,255,255,0.05) 100%);
}

.port-card.available:hover {
  box-shadow: 0 0 20px var(--secondary-glow);
  transform: translateY(-5px);
}

.port-card.in-use {
  border-color: var(--accent-red);
  background: rgba(255, 71, 87, 0.1);
  cursor: not-allowed;
  opacity: 0.8;
}

.port-card.no-points {
  border-color: var(--text-dim);
  background: rgba(255, 255, 255, 0.05);
  cursor: not-allowed;
  opacity: 0.5;
}

.port-icon-wrapper {
  background: rgba(17, 153, 142, 0.1);
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  font-size: 2.5rem;
}

.port-info {
  text-align: center;
}

.port-number {
  display: block;
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 5px;
}

.port-status {
  display: block;
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 5px;
}

.port-subtext {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.back-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.1rem;
  cursor: pointer;
  padding: 10px 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: color 0.3s ease;
}

.back-btn:hover {
  color: var(--primary);
}

.back-btn .arrow {
  transition: transform 0.3s ease;
}

.back-btn:hover .arrow {
  transform: translateX(-5px);
}

/* Shared Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

.points-hidden {
  display: none;
}

/* Compact Screen Optimizations (800x480) */
@media (max-height: 480px) {
  .app-header {
    height: 50px;
    padding: 0 20px;
    margin: 10px 10px 0 10px;
  }
  
  .app-title {
    font-size: 1.5rem;
  }
  
  .active-status-badge {
    padding: 4px 10px;
    font-size: 0.8rem;
  }
  
  .app-content {
    padding: 10px;
  }
  
  .view-container {
    gap: 15px;
  }
  
  /* Home View Compact */
  .home-view {
    margin-top: 0;
  }
  
  .action-card {
    height: 140px;
    padding: 20px 10px;
  }
  
  .icon-wrapper {
    font-size: 2.5rem;
    margin-bottom: 10px;
  }
  
  .card-title {
    font-size: 1.1rem;
  }
  
  .card-desc {
    font-size: 0.8rem;
  }
  
  /* Select Port View Compact */
  .view-title {
    font-size: 1.8rem;
    margin-bottom: 15px;
  }
  
  .port-card {
    padding: 15px;
    height: 180px;
  }
  
  .port-icon-wrapper {
    width: 60px;
    height: 60px;
    font-size: 2rem;
    margin-bottom: 10px;
  }
  
  .port-number {
    font-size: 1.1rem;
  }
  
  .port-status {
    font-size: 1.2rem;
  }
  
  .port-subtext {
    font-size: 0.8rem;
  }
  
  .back-btn {
    padding: 5px 15px;
    font-size: 1rem;
  }
}
</style>
