<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { Zap, Download, Gift, Cable, ArrowLeft, CheckCircle, Activity } from 'lucide-vue-next'
import Swal from 'sweetalert2'
import PointsDisplay from './components/PointsDisplay.vue'
import StorePointView from './components/StorePointView.vue'
import RedeemView from './components/RedeemView.vue'
import ChargingProgress from './components/ChargingProgress.vue'
import { QrCode as QrCodeIcon } from 'lucide-vue-next'
import IdleOverlay from './components/IdleOverlay.vue'

const currentView = ref('home') // home, selectPort, confirmation, storePoint, redeem, charging
const selectedPort = ref(null)
const pointsDisplayRef = ref(null)
const storedQrData = ref('')
const storedPoints = ref(0)
const portStatuses = ref([null, null, null]) // Status for ports 1, 2, 3
const currentPoints = ref(0)
const chargingDuration = ref(0)
const kioskCode = ref('UCC-Kiosk-0001')
const devModeClicks = ref(0)
const isDevMode = ref(false)
const isSimulating = ref(false)
const isIdle = ref(false)
const lastActivity = ref(Date.now())
const isShowingIdlePrompt = ref(false)
let statusInterval = null
let idleTimer = null

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

    window.electronAPI.on('remote-activation-started', (data) => {
      console.log('[REMOTE EVENT] Received activation:', data);
      Swal.fire({
        title: 'Remote Activation',
        text: `Port ${data.port} has been activated remotely for ${data.points} points (${Math.floor(data.durationSeconds / 60)} mins).`,
        icon: 'success',
        timer: 5000,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        background: '#ffffff',
        color: '#0f172a'
      });
      
      // If we are currently in selectPort view, we might want to refresh
      if (currentView.value === 'selectPort') {
        updatePortStatuses();
      }
    });
    console.log('✅ Registered remote-activation-started event listener');

    window.electronAPI.on('remote-deactivation-started', (data) => {
      console.log('[REMOTE EVENT] Received deactivation:', data);
      Swal.fire({
        title: 'Session Cancelled',
        text: `Charging on Port ${data.port} has been cancelled remotely.`,
        icon: 'info',
        timer: 4000,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        background: '#ffffff',
        color: '#0f172a'
      });
      
      if (currentView.value === 'selectPort' || currentView.value === 'charging') {
        updatePortStatuses();
        // If we were in the charging view for THIS specific port, we should go back
        if (currentView.value === 'charging' && selectedPort.value === data.port) {
          currentView.value = 'home';
        }
      }
    });

    window.electronAPI.on('points-updated', (data) => {
      console.log('[POINTS EVENT] Syncing points:', data.points);
      currentPoints.value = data.points;
    });
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

  // Sync points every 2 seconds to ensure UI stays updated
  setInterval(updateCurrentPoints, 2000)

  // Idle Tracking
  const activityEvents = ['mousedown', 'mousemove', 'keypress', 'touchstart', 'scroll']
  activityEvents.forEach(event => {
    window.addEventListener(event, resetIdleTimer, { passive: true })
  })

  idleTimer = setInterval(checkIdle, 1000)

  // Reduced polling to 10 seconds as fallback (events handle real-time updates)
  statusInterval = setInterval(updatePortStatuses, 5000)
})

const resetIdleTimer = () => {
  lastActivity.value = Date.now()
  if (isIdle.value) {
    isIdle.value = false
  }
}

const checkIdle = () => {
  const now = Date.now()
  const idleTime = now - lastActivity.value

  // 1 MINUTE IDLE: Show screen saver IF on home screen
  if (currentView.value === 'home' && idleTime >= 60000 && !isIdle.value) {
    isIdle.value = true
  }

  // 20 SECONDS IDLE: "Are you still there?" on transaction views
  const transactionViews = ['selectPort', 'storePoint', 'redeem']
  if (transactionViews.includes(currentView.value) && idleTime >= 20000 && !isShowingIdlePrompt.value) {
    showIdlePrompt()
  }
}

const showIdlePrompt = async () => {
  isShowingIdlePrompt.value = true
  
  const result = await Swal.fire({
    title: 'Are you still there?',
    text: 'Your session will reset soon due to inactivity.',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Yes, I\'m here',
    cancelButtonText: 'Cancel Session',
    timer: 10000,
    timerProgressBar: true,
    background: '#ffffff',
    color: '#0f172a',
    confirmButtonColor: '#11998e',
    allowOutsideClick: false
  })

  isShowingIdlePrompt.value = false
  
  if (result.isConfirmed) {
    resetIdleTimer()
  } else {
    // Dismissed, timed out, or "Cancel Session" clicked
    resetToHome()
  }
}

onUnmounted(() => {
  if (statusInterval) clearInterval(statusInterval)
  if (idleTimer) clearInterval(idleTimer)
  
  const activityEvents = ['mousedown', 'mousemove', 'keypress', 'touchstart', 'scroll']
  activityEvents.forEach(event => {
    window.removeEventListener(event, resetIdleTimer)
  })
})

function goToUseNow() {
  updateCurrentPoints()
  currentView.value = 'selectPort'
}

function goToRedeem() {
  currentView.value = 'redeem'
}

function handleLogoClick() {
  devModeClicks.value++
  if (devModeClicks.value >= 5) {
    isDevMode.value = true
    Swal.fire({
      title: 'Dev Mode Active',
      text: 'Redeem (Manual) button is now available.',
      icon: 'info',
      timer: 1500,
      showConfirmButton: false,
      background: '#ffffff',
      color: '#0f172a'
    })
    devModeClicks.value = 0
  }
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
  // 2. Ask how many points to store
  const { value: pointsToStore } = await Swal.fire({
    title: 'Store Points',
    text: `How many points would you like to store? (Available: ${currentPoints.value})`,
    input: 'number',
    inputAttributes: {
      min: 1,
      max: currentPoints.value,
      step: 1
    },
    inputValue: currentPoints.value,
    showCancelButton: true,
    confirmButtonText: 'Store Points',
    confirmButtonColor: '#11998e',
    background: '#ffffff',
    color: '#0f172a',
    inputValidator: (value) => {
      if (!value || value <= 0) {
        return 'Please enter a valid amount of points'
      }
      if (value > currentPoints.value) {
        return `You only have ${currentPoints.value} points available`
      }
    }
  });

  if (!pointsToStore) return;

  storedPoints.value = parseInt(pointsToStore)
  
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
    Swal.fire({
      title: 'No Points',
      text: 'You do not have any points to use.',
      icon: 'warning',
      background: '#ffffff',
      color: '#0f172a'
    });
    return
  }
  
  // Check if port is already in use
  const portStatus = portStatuses.value.find(s => s && s.port === portNumber)
  if (portStatus && portStatus.active) {
    Swal.fire({
      title: 'Port In Use',
      text: `Port ${portNumber} is currently active. Please choose another port.`,
      icon: 'error',
      background: '#ffffff',
      color: '#0f172a'
    });
    return
  }

  // Ask how many points to use
  const { value: pointsToUse } = await Swal.fire({
    title: `Charge on Port ${portNumber}`,
    text: `How many points would you like to use? (Available: ${currentPoints.value})`,
    input: 'number',
    inputAttributes: {
      min: 1,
      max: currentPoints.value,
      step: 1
    },
    inputValue: currentPoints.value,
    showCancelButton: true,
    confirmButtonText: 'Start Charging',
    confirmButtonColor: '#11998e',
    background: '#ffffff',
    color: '#0f172a',
    inputValidator: (value) => {
      if (!value || value <= 0) {
        return 'Please enter a valid amount of points'
      }
      if (value > currentPoints.value) {
        return `You only have ${currentPoints.value} points available`
      }
    }
  })

  if (!pointsToUse) return;

  const pointsNum = parseInt(pointsToUse)
  
  // Warning about non-refundable points
  const confirmStart = await Swal.fire({
    title: '⚠️ Important Notice',
    html: `<p style="font-size: 1.1rem; margin-bottom: 15px;">You are about to use <strong>${pointsNum} points</strong> for charging.</p>
           <p style="color: #dc2626; font-weight: 600; font-size: 1rem;">⚠️ Points cannot be refunded once charging starts!</p>
           <p style="margin-top: 10px; font-size: 0.95rem; color: #64748b;">You can cancel the session early, but used points will not be returned.</p>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'I Understand, Start Now',
    cancelButtonText: 'Go Back',
    confirmButtonColor: '#11998e',
    cancelButtonColor: '#94a3b8',
    background: '#ffffff',
    color: '#0f172a',
    reverseButtons: true
  })

  if (!confirmStart.isConfirmed) return;
  
  // Activate charging
  try {
    const result = await window.electronAPI.invoke('activate-charging', {
      port: portNumber,
      points: pointsNum
    })
    
    if (result.success) {
      // Force refresh points display
      if (pointsDisplayRef.value && pointsDisplayRef.value.refreshPoints) {
        await pointsDisplayRef.value.refreshPoints()
      }
      
      // Update local current points
      await updateCurrentPoints()
      
      // Show success message
      const minutes = Math.floor(result.durationSeconds / 60)
      Swal.fire({
        title: 'Charging Started!',
        html: `✅ Port ${portNumber} is now active.<br><br><b>Duration:</b> ${minutes} minutes<br><b>Points Used:</b> ${pointsNum}`,
        icon: 'success',
        timer: 3000,
        showConfirmButton: false,
        background: '#ffffff',
        color: '#0f172a'
      })
      
      // Return to home immediately so user can use other ports
      currentView.value = 'home'
    } else {
      Swal.fire({
        title: 'Error',
        text: result.error || 'Failed to start charging',
        icon: 'error',
        background: '#ffffff',
        color: '#0f172a'
      })
    }
  } catch (err) {
    console.error('Error in selectPort:', err)
    Swal.fire({
      title: 'System Error',
      text: 'An unexpected error occurred while starting the port.',
      icon: 'error',
      background: '#ffffff',
      color: '#0f172a'
    })
  }
}

async function simulateCharging(portNumber) {
  selectedPort.value = portNumber
  chargingDuration.value = 60 // 1 minute simulation
  isSimulating.value = true
  currentView.value = 'charging'
  
  Swal.fire({
    title: 'Simulation Started',
    text: `Viewing timer UI for Port ${portNumber} (1 minute)`,
    icon: 'info',
    timer: 2000,
    showConfirmButton: false,
    background: '#ffffff',
    color: '#0f172a'
  })
}

function resetToHome() {
  currentView.value = 'home'
  selectedPort.value = null
  storedQrData.value = ''
  storedPoints.value = 0
  chargingDuration.value = 0
  isSimulating.value = false
  
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
      <div class="logo-area" @click="handleLogoClick" style="cursor: pointer">
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
          <div :class="['action-grid', { 'three-cols': isDevMode }]">
            <button class="action-card primary glass-panel" @click="goToUseNow">
              <div class="icon-wrapper"><Zap :size="48" /></div>
              <div class="card-content">
                <span class="card-title">Use Points</span>
                <span class="card-desc">Start Charging</span>
              </div>
            </button>
            
            <button 
              class="action-card secondary glass-panel" 
              @click="goToStorePoint"
              :disabled="currentPoints <= 0"
            >
              <div class="icon-wrapper"><Download :size="48" /></div>
              <div class="card-content">
                <span class="card-title">Store Points</span>
                <span class="card-desc">Save for later</span>
              </div>
            </button>

            <button v-if="isDevMode" class="action-card tertiary glass-panel" @click="goToRedeem">
              <div class="icon-wrapper"><Gift :size="48" /></div>
              <div class="card-content">
                <span class="card-title">Redeem</span>
                <span class="card-desc">Manual Entry</span>
              </div>
            </button>
          </div>
        </div>
        
        <!-- Select Port View -->
        <div v-else-if="currentView === 'selectPort'" class="view-container select-port-view" key="selectPort">
          <div class="view-header-with-action">
            <h2 class="view-title">Select Charging Port</h2>
            <button class="simulate-test-btn glass-panel" @click="simulateCharging(1)">
              <Activity :size="18" /> Simulate Test
            </button>
          </div>
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
          <RedeemView 
            @complete="onRedeemComplete" 
            @hideDevMode="() => { isDevMode = false; resetToHome(); }"
          />
        </div>
        
        <!-- Charging Progress View -->
        <div v-else-if="currentView === 'charging'" class="view-container centered-view" key="charging">
          <ChargingProgress 
            :port="selectedPort" 
            :totalSeconds="chargingDuration"
            :simulate="isSimulating"
            @complete="onChargingComplete"
            @cancel="resetToHome" 
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

    <!-- Idle Overlay / Screen Saver -->
    <Transition name="fade">
      <IdleOverlay v-if="isIdle" @dismiss="resetIdleTimer" />
    </Transition>
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

/* Header Responsive */
.app-header {
  height: clamp(50px, 12vw, 100px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 clamp(15px, 5vw, 40px);
  margin: clamp(8px, 2vw, 20px) clamp(10px, 3vw, 20px) 0 clamp(10px, 3vw, 20px);
  z-index: 10;
}

.app-title {
  font-size: var(--font-h1);
  font-weight: 700;
  letter-spacing: -1px;
}

.active-status-badge {
  display: flex;
  align-items: center;
  gap: clamp(6px, 1vw, 10px);
  background: rgba(17, 153, 142, 0.1);
  padding: clamp(6px, 1.5vw, 8px) clamp(12px, 2vw, 16px);
  border-radius: 20px;
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--primary);
  border: 1px solid var(--primary);
  white-space: nowrap;
}

/* Content Area */
.app-content {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: clamp(10px, 3vw, 20px);
  position: relative;
  overflow-y: auto;
}

.view-container {
  width: 100%;
  max-width: 1200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-lg);
  padding: 0 clamp(0px, 2vw, 20px);
}

/* Home View */
.home-view {
  margin-top: 0;
}

.hero-section {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: clamp(10px, 2vw, 20px);
}

/* Action Grid - Responsive */
.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: clamp(16px, 3vw, 24px);
  width: 100%;
  max-width: 100%;
}

.action-grid.three-cols {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.action-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: clamp(20px, 4vw, 40px) clamp(12px, 3vw, 20px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  color: var(--text-main);
  background: white;
  cursor: pointer;
  transition: all 0.3s var(--ease-spring);
  text-align: center;
  height: clamp(140px, 20vw, 220px);
  box-shadow: var(--shadow-lg);
  border-radius: var(--radius-lg);
  min-height: 44px;
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

.action-card:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(0.8);
  box-shadow: none !important;
  transform: none !important;
}

.action-card.primary {
  border-color: rgba(17, 153, 142, 0.4);
}

.action-card.primary:hover {
  box-shadow: 0 0 30px rgba(17, 153, 142, 0.4);
}

.icon-wrapper {
  font-size: clamp(2rem, 8vw, 3.5rem);
  margin-bottom: clamp(10px, 2vw, 20px);
  filter: drop-shadow(0 0 10px rgba(255,255,255,0.3));
}

.card-title {
  display: block;
  font-size: clamp(1.1rem, 3vw, 1.5rem);
  font-weight: 700;
  margin-bottom: clamp(3px, 1vw, 5px);
}

.card-desc {
  display: block;
  font-size: clamp(0.8rem, 2vw, 0.9rem);
  color: var(--text-muted);
}

/* Status Summary */
.status-summary {
  width: 100%;
  padding: clamp(12px, 3vw, 20px);
  margin-bottom: var(--space-lg);
  border-radius: var(--radius-lg);
}

.section-label {
  font-size: var(--font-sm);
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin-bottom: clamp(10px, 2vw, 15px);
}

.mini-status-grid {
  display: flex;
  gap: clamp(10px, 2vw, 15px);
  flex-wrap: wrap;
}

.mini-status-item {
  display: flex;
  align-items: center;
  gap: clamp(8px, 1vw, 10px);
  background: var(--text-main);
  padding: clamp(6px, 1.5vw, 8px) clamp(12px, 2vw, 16px);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--secondary);
  min-height: 44px;
}

.port-id {
  font-weight: 600;
  color: white;
  white-space: nowrap;
  font-size: clamp(0.85rem, 2vw, 1rem);
}

.port-timer {
  font-family: monospace;
  color: var(--secondary);
  font-size: clamp(0.85rem, 2vw, 1rem);
}

/* Select Port View */
.view-title {
  font-size: var(--font-h2);
  font-weight: 700;
  margin-bottom: clamp(12px, 2vw, 20px);
  width: 100%;
  text-align: center;
}

.ports-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: clamp(15px, 3vw, 20px);
  width: 100%;
}

@media (max-width: 600px) {
  .ports-grid {
    grid-template-columns: 1fr;
  }
}

@media (min-width: 900px) {
  .ports-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.view-header-with-action {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: clamp(8px, 2vw, 15px);
  flex-wrap: wrap;
  gap: clamp(12px, 2vw, 20px);
}

.simulate-test-btn {
  display: flex;
  align-items: center;
  gap: clamp(6px, 1vw, 8px);
  padding: clamp(8px, 2vw, 10px) clamp(16px, 3vw, 20px);
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(17, 153, 142, 0.3);
  color: var(--primary);
  border-radius: var(--radius-lg);
  font-weight: 600;
  font-size: clamp(0.85rem, 2vw, 1rem);
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
}

.simulate-test-btn:hover {
  background: var(--primary);
  color: white;
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(17, 153, 142, 0.2);
}

.port-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: clamp(15px, 3vw, 20px);
  height: clamp(160px, 25vw, 200px);
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.3s ease;
  color: var(--text-main);
  position: relative;
  overflow: hidden;
  background: white;
  width: 100%;
  border-radius: var(--radius-lg);
  min-height: 44px;
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
  width: clamp(50px, 12vw, 80px);
  height: clamp(50px, 12vw, 80px);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: clamp(10px, 2vw, 20px);
  font-size: clamp(1.8rem, 5vw, 2.5rem);
}

.port-info {
  text-align: center;
}

.port-number {
  display: block;
  font-size: clamp(1rem, 2.5vw, 1.25rem);
  font-weight: 700;
  margin-bottom: clamp(3px, 0.5vw, 5px);
}

.port-status {
  display: block;
  font-size: clamp(1.2rem, 3vw, 1.5rem);
  font-weight: 600;
  margin-bottom: clamp(3px, 0.5vw, 5px);
}

.port-subtext {
  font-size: clamp(0.8rem, 2vw, 0.9rem);
  color: var(--text-muted);
}

.back-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: clamp(0.95rem, 2vw, 1.1rem);
  cursor: pointer;
  padding: clamp(8px, 2vw, 10px) clamp(15px, 3vw, 20px);
  display: flex;
  align-items: center;
  gap: clamp(8px, 1vw, 10px);
  transition: color 0.3s ease;
  min-height: 44px;
  min-width: 44px;
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

/* ============================================
   COMPREHENSIVE RESPONSIVE BREAKPOINTS
   ============================================ */

/* Extra Small (max 480px) */
@media (max-width: 480px) {
  .app-header {
    padding: 0 clamp(10px, 3vw, 15px);
    margin: 8px clamp(8px, 2vw, 10px) 0 clamp(8px, 2vw, 10px);
  }

  .view-header-with-action {
    flex-direction: column;
    align-items: stretch;
  }

  .simulate-test-btn {
    width: 100%;
    justify-content: center;
  }

  .action-grid {
    grid-template-columns: 1fr;
  }

  .action-grid.three-cols {
    grid-template-columns: 1fr;
  }

  .icon-wrapper {
    font-size: clamp(1.8rem, 6vw, 2.5rem);
  }
}

/* Small (481px - 640px) */
@media (min-width: 481px) and (max-width: 640px) {
  .action-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .action-grid.three-cols {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Tablet (641px - 900px) */
@media (min-width: 641px) and (max-width: 900px) {
  .view-container {
    gap: clamp(20px, 3vw, 30px);
  }

  .ports-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Large Tablet & Desktop (901px+) */
@media (min-width: 901px) {
  .app-content {
    padding: clamp(20px, 4vw, 40px);
  }

  .view-container {
    gap: var(--space-xl);
  }

  .action-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .action-grid.three-cols {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* Very Tall Screens (height > 900px) */
@media (min-height: 900px) {
  .app-content {
    justify-content: flex-start;
    padding-top: clamp(20px, 5vh, 40px);
  }
}

/* Very Short Screens (height < 500px) */
@media (max-height: 500px) {
  .app-content {
    overflow-y: auto;
  }

  .view-container {
    gap: clamp(10px, 2vh, 15px);
  }

  .action-card {
    height: clamp(100px, 15vh, 140px);
    padding: clamp(12px, 2vh, 15px) clamp(10px, 2vw, 15px);
  }

  .icon-wrapper {
    font-size: clamp(1.5rem, 4vh, 2rem);
    margin-bottom: clamp(5px, 1vh, 8px);
  }

  .card-title {
    font-size: clamp(0.95rem, 2vh, 1.1rem);
  }

  .card-desc {
    font-size: clamp(0.75rem, 1.5vh, 0.8rem);
  }

  .view-title {
    font-size: clamp(1.4rem, 3vh, 1.8rem);
    margin-bottom: clamp(8px, 1.5vh, 12px);
  }

  .port-card {
    height: clamp(140px, 18vh, 180px);
    padding: clamp(10px, 2vh, 12px);
  }

  .back-btn {
    font-size: clamp(0.9rem, 1.8vh, 1rem);
    padding: clamp(6px, 1vh, 8px) clamp(10px, 2vw, 15px);
  }
}

/* Extra Short Screens (height < 400px) */
@media (max-height: 400px) {
  .app-header {
    height: clamp(40px, 10vh, 50px);
    margin: clamp(4px, 1vh, 8px) clamp(8px, 2vw, 10px) 0;
  }

  .view-container {
    gap: clamp(8px, 1.5vh, 12px);
  }

  .action-card {
    height: clamp(80px, 12vh, 120px);
  }

  .icon-wrapper {
    margin-bottom: clamp(3px, 0.5vh, 5px);
  }
}

/* Landscape Orientation (width > 1.5x height) */
@media (orientation: landscape) and (max-height: 700px) {
  .app-header {
    height: clamp(40px, 10vh, 60px);
    margin: clamp(4px, 1vh, 8px) clamp(10px, 2vw, 15px) 0;
  }

  .app-content {
    padding: clamp(8px, 1.5vh, 12px);
  }

  .view-container {
    gap: clamp(12px, 2vh, 16px);
  }

  .action-card {
    height: clamp(100px, 14vh, 140px);
  }

  .ports-grid {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }
}

/* Very Wide Screens (1920px+) */
@media (min-width: 1920px) {
  .app-content {
    padding: 30px;
  }

  .view-container {
    max-width: 1400px;
  }

  .action-grid {
    gap: 30px;
  }

  .ports-grid {
    gap: 30px;
  }
}

/* Ultra Wide Screens (2560px+) */
@media (min-width: 2560px) {
  .view-container {
    max-width: 1600px;
  }

  .app-title {
    font-size: 3.5rem;
  }

  .view-title {
    font-size: 3rem;
  }
}
</style>
