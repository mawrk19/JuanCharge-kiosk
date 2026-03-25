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

const ensurePointNumpadStyles = () => {
  if (document.getElementById('jc-point-numpad-style')) return

  const style = document.createElement('style')
  style.id = 'jc-point-numpad-style'
  style.textContent = `
    .jc-point-popup { width: min(94vw, 760px) !important; }
    .jc-point-layout {
      display: grid;
      grid-template-columns: 1fr 230px;
      gap: 14px;
      align-items: start;
      margin-top: 4px;
    }
    .jc-point-panel {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .jc-point-label {
      font-size: 0.92rem;
      font-weight: 600;
      color: #334155;
      text-align: left;
    }
    .jc-point-input {
      margin: 0 !important;
      width: 100% !important;
      text-align: right;
      font-size: 1.8rem !important;
      font-weight: 700;
      padding: 10px 14px !important;
      border-radius: 12px !important;
    }
    .jc-point-hint {
      font-size: 0.82rem;
      color: #64748b;
      text-align: left;
    }
    .jc-numpad {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .jc-key {
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      background: #f8fafc;
      color: #0f172a;
      font-weight: 700;
      font-size: 1rem;
      min-height: 44px;
      cursor: pointer;
    }
    .jc-key:active {
      transform: scale(0.97);
      background: #e2e8f0;
    }
    .jc-key.jc-key-clear { color: #dc2626; border-color: #fecaca; background: #fff1f2; }
    .jc-key.jc-key-back { color: #11998e; border-color: #99f6e4; background: #f0fdfa; }
    @media (max-width: 800px), (max-height: 480px) {
      .jc-point-popup { width: min(98vw, 700px) !important; }
      .jc-point-layout { grid-template-columns: 1fr 190px; gap: 10px; }
      .jc-point-input { font-size: 1.4rem !important; }
      .jc-key { min-height: 36px; font-size: 0.9rem; }
    }
  `
  document.head.appendChild(style)
}

const showPointNumpadModal = async ({ title, availablePoints, confirmButtonText }) => {
  ensurePointNumpadStyles()

  const result = await Swal.fire({
    title,
    html: `
      <div class="jc-point-layout">
        <div class="jc-point-panel">
          <label class="jc-point-label">Points</label>
          <input id="jc-point-input" class="swal2-input jc-point-input" value="${availablePoints}" readonly inputmode="none" />
          <div class="jc-point-hint">Available: ${availablePoints}</div>
        </div>
        <div class="jc-numpad">
          <button type="button" class="jc-key" data-key="1">1</button>
          <button type="button" class="jc-key" data-key="2">2</button>
          <button type="button" class="jc-key" data-key="3">3</button>
          <button type="button" class="jc-key" data-key="4">4</button>
          <button type="button" class="jc-key" data-key="5">5</button>
          <button type="button" class="jc-key" data-key="6">6</button>
          <button type="button" class="jc-key" data-key="7">7</button>
          <button type="button" class="jc-key" data-key="8">8</button>
          <button type="button" class="jc-key" data-key="9">9</button>
          <button type="button" class="jc-key jc-key-clear" data-key="clear">C</button>
          <button type="button" class="jc-key" data-key="0">0</button>
          <button type="button" class="jc-key jc-key-back" data-key="back">⌫</button>
        </div>
      </div>
    `,
    customClass: {
      popup: 'jc-point-popup'
    },
    showCancelButton: true,
    confirmButtonText,
    confirmButtonColor: '#11998e',
    background: '#ffffff',
    color: '#0f172a',
    didOpen: (modal) => {
      const input = modal.querySelector('#jc-point-input')
      const keys = modal.querySelectorAll('.jc-key')

      const writeValue = (next) => {
        const parsed = parseInt(next || '0', 10)
        if (parsed > availablePoints) {
          input.value = String(availablePoints)
          return
        }
        input.value = next
      }

      keys.forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = btn.getAttribute('data-key')
          const current = input.value || ''

          if (key === 'clear') {
            input.value = ''
            return
          }

          if (key === 'back') {
            input.value = current.slice(0, -1)
            return
          }

          if (current.length >= 4) return

          const next = current === '0' ? key : `${current}${key}`
          writeValue(next)
        })
      })
    },
    preConfirm: () => {
      const rawValue = document.getElementById('jc-point-input')?.value?.trim() || ''
      const points = parseInt(rawValue, 10)

      if (!rawValue || Number.isNaN(points) || points <= 0) {
        Swal.showValidationMessage('Please enter a valid amount of points')
        return false
      }

      if (points > availablePoints) {
        Swal.showValidationMessage(`You only have ${availablePoints} points available`)
        return false
      }

      return points
    }
  })

  if (!result.isConfirmed) return null
  return result.value
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
  const pointsToStore = await showPointNumpadModal({
    title: 'Store Points',
    availablePoints: currentPoints.value,
    confirmButtonText: 'Store Points'
  })

  if (!pointsToStore) return

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
  const pointsToUse = await showPointNumpadModal({
    title: `Charge on Port ${portNumber}`,
    availablePoints: currentPoints.value,
    confirmButtonText: 'Start Charging'
  })

  if (!pointsToUse) return

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
    <!-- Main Content -->
    <main class="app-content">
      <Transition name="fade" mode="out-in">
        <!-- Home View -->
        <div v-if="currentView === 'home'" class="view-container home-view" key="home">
          <div class="home-split">
            <div class="home-main-panel">
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

            <aside class="instruction-panel glass-panel">
              <h2>♻️ Before Inserting</h2>

              <ul class="instruction-list">
                <li>Make sure all bottles and containers are completely empty</li>
                <li>Remove any leftover contents such as liquids, trash, or residue</li>
              </ul>

              <div class="section">
                <p class="section-title">Accepted Items Only</p>
                <ul class="accepted-list">
                  <li>PET plastic bottles</li>
                  <li>Tin cans</li>
                  <li>Aluminum cans</li>
                </ul>
              </div>

              <div class="section">
                <p class="section-title">How to Insert</p>
                <ul class="instruction-list">
                  <li>Insert only one item at a time</li>
                  <li>Place the item properly into the slot</li>
                  <li>Wait for the system to process before inserting the next item</li>
                </ul>
              </div>
            </aside>
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
  min-height: 0;
  overflow: hidden;
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
  padding: clamp(10px, 2vh, 18px) clamp(8px, 2vw, 14px);
  position: relative;
  min-height: 0;
  overflow: hidden;
}

.home-split {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); /* 60/40 main vs instructions */
  gap: 10px;
  width: 100%;
  max-width: 1000px;
  min-height: 0;
  height: 100%;
  align-items: flex-start;
}

.home-main-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  max-width: 100%;
}

.instruction-panel {
  width: min(72vw, 320px); /* narrower instructions to emphasize main UI */
  min-width: 220px;
  max-width: 320px;
  max-height: calc(100vh - 30px);
  min-height: 520px; /* larger vertical size, bottom growth for right-side button alignment */
  overflow-y: auto;
  align-self: flex-start;
  margin-top: 0; /* align top with digital balance card */
  box-shadow: 0 4px 14px rgba(0,0,0,0.25);
}

.instruction-panel ul {
  margin: 0;
  padding-left: 18px;
  font-size: clamp(1.1rem, 3.0vh, 1.3rem);
  line-height: 1.8;
}

.instruction-panel li {
  margin-bottom: 10px;
}

.instruction-panel h3 {
  font-size: clamp(1.3rem, 3.8vh, 1.6rem);
  margin-bottom: 12px;
}

.instruction-panel ul {
  margin: 0;
  padding-left: 18px;
  font-size: clamp(1.1rem, 3.0vh, 1.3rem);
  line-height: 1.55;
}

.instruction-panel li {
  margin-bottom: 6px;
}

.instruction-panel .accepted-item {
  font-weight: 700;
  color: #064e3b;
  margin-left: 4px;
}

.instruction-panel strong {
  font-size: clamp(1.05rem, 2.9vh, 1.25rem);
}


.instruction-panel h3 {
  margin: 0 0 6px;
  font-size: 0.95rem;
  font-weight: 700;
  color: #b91c1c;
}

.instruction-panel ul {
  margin: 0;
  padding-left: 16px;
  font-size: 0.78rem;
  line-height: 1.3;
}

.instruction-panel li {
  margin-bottom: 4px;
}

.instruction-panel .accepted-item {
  font-weight: 700;
  color: #064e3b;
}

@media (max-width: 900px), (max-height: 540px) {
  .home-split {
    grid-template-columns: 1.2fr 1fr;
    gap: 6px;
  }
  .instruction-panel {
    margin-top: 70px;
    max-height: calc(100vh - 40px);
    min-height: 500px;
    min-width: 210px;
    font-size: clamp(0.95rem, 2.6vh, 1.05rem);
  }
  .action-card {
    padding: 10px;
    height: clamp(110px, 24vh, 148px);
    min-height: 110px;
  }
}

.view-container {
  width: 100%;
  max-width: 1000px;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(14px, 2.8vh, 30px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px;
}

/* Home View */
.home-view {
  margin-top: 0; /* Remove negative adjustment to prevent overlap */
}

.hero-section {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: clamp(8px, 2vh, 20px);
}

.instruction-panel {
  width: min(70vw, 300px);
  min-width: 220px;
  max-width: 300px;
  background: #fff9ed;
  border: 1px solid #facc15;
  border-radius: 10px;
  padding: 10px 12px;
  color: #1f2937;
  text-align: left;
  box-shadow: 0 0 10px rgba(250, 204, 21, 0.22);
  font-size: clamp(0.8rem, 2.3vh, 1rem);
  min-height: 550px; /* reduced to better match Use/Store button height */
  max-height: calc(100vh - 20px);
}

.instruction-panel h3 {
  font-size: clamp(1.1rem, 2.9vh, 1.3rem);
  margin-bottom: 10px;
}

.instruction-panel ul {
  padding-left: 14px;
  line-height: 1.5;
  font-size: clamp(0.9rem, 2.2vh, 1.05rem);
}

.instruction-panel li {
  margin-bottom: 8px;
  margin-left: 4px;
}

  .instruction-list,
  .accepted-list {
    list-style-type: disc;
    margin: 0 0 10px;
    padding-left: 20px;
  }

  .section {
    margin: 12px 0;
    padding: 10px;
    background: rgba(17, 153, 142, 0.08);
    border-radius: 8px;
    border: 1px solid rgba(56, 239, 125, 0.3);
  }

  .section-title {
    font-size: clamp(0.95rem, 2.3vh, 1.1rem);
    font-weight: 700;
    margin-bottom: 8px;
    color: #0f5132;
  }

  .instruction-list li,
  .accepted-list li {
    margin-bottom: 8px;
    line-height: 1.45;
  }

  .instruction-panel .accepted-item {
    margin-left: 8px;
    font-weight: 800;
    color: #064e3b;
}

.instruction-panel h3 {
  font-size: clamp(1rem, 2.6vh, 1.2rem);
}

.instruction-panel ul {
  padding-left: 16px;
  line-height: 1.45;
  font-size: clamp(0.85rem, 2.1vh, 1rem);
}

.instruction-panel li {
  margin-bottom: 6px;
}

.instruction-panel .accepted-item {
  font-weight: 700;
  color: #064e3b;
}

.instruction-panel h3 {
  margin: 0 0 6px;
  color: #b91c1c;
  font-weight: 700;
  font-size: clamp(0.8rem, 2vh, 1rem);
}

.instruction-panel ul {
  margin: 0;
  padding-left: 18px;
  line-height: 1.3;
}

.instruction-panel li {
  margin-bottom: 4px;
}

.instruction-panel .accepted-item {
  font-weight: 700;
  margin-left: 6px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: clamp(10px, 2vw, 24px);
  width: 100%;
}

.action-grid.three-cols {
  grid-template-columns: repeat(3, 1fr);
}

.action-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: clamp(14px, 3vh, 40px) clamp(10px, 2vw, 20px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  color: var(--text-main);
  background: white;
  cursor: pointer;
  transition: all 0.3s var(--ease-spring);
  text-align: center;
  height: clamp(120px, 28vh, 220px);
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
  font-size: clamp(2rem, 6vh, 3.5rem);
  margin-bottom: clamp(8px, 1.5vh, 20px);
  filter: drop-shadow(0 0 10px rgba(255,255,255,0.3));
}

.card-title {
  display: block;
  font-size: clamp(1rem, 2.9vh, 1.5rem);
  font-weight: 700;
  margin-bottom: 5px;
}

.card-desc {
  display: block;
  font-size: clamp(0.78rem, 1.8vh, 0.9rem);
  color: var(--text-muted);
}

/* Status Summary */
.status-summary {
  width: 100%;
  padding: clamp(10px, 2vh, 20px);
  margin-bottom: clamp(8px, 2vh, 20px);
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
  gap: 12px;
  flex-wrap: wrap;
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
.select-port-view {
  gap: clamp(10px, 2.2vh, 24px);
}

.view-title {
  font-size: clamp(1.4rem, 5vh, 2.5rem);
  font-weight: 700;
  margin-bottom: clamp(8px, 2vh, 20px);
}

.ports-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: clamp(8px, 1.5vw, 20px);
  width: 100%;
}

.view-header-with-action {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0;
  gap: 10px;
}

.simulate-test-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(17, 153, 142, 0.3);
  color: var(--primary);
  border-radius: var(--radius-lg);
  font-weight: 600;
  font-size: clamp(0.8rem, 1.7vh, 0.95rem);
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.3s ease;
}

.simulate-test-btn:hover {
  background: var(--primary);
  color: white;
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(17, 153, 142, 0.2);
}

.port-card-wrapper {
  display: flex;
  flex-direction: column;
  gap: 15px;
  width: 100%;
}

.port-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: clamp(10px, 2vh, 20px);
  height: clamp(132px, 30vh, 200px);
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.3s ease;
  color: var(--text-main);
  position: relative;
  overflow: hidden;
  background: white;
  width: 100%;
}

.port-qr-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 15px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: var(--radius-lg);
  border: 1px solid rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
}

.port-card-wrapper:hover .port-qr-section {
  border-color: var(--secondary);
  box-shadow: 0 4px 15px rgba(56, 239, 125, 0.2);
}

.port-qr-img {
  width: 100px;
  height: 100px;
  object-fit: contain;
  background: white;
  padding: 5px;
  border-radius: 4px;
}

.qr-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
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
  width: clamp(54px, 9vh, 80px);
  height: clamp(54px, 9vh, 80px);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: clamp(8px, 1.8vh, 20px);
  font-size: 2.5rem;
}

.port-info {
  text-align: center;
  width: 100%;
}

.port-number {
  display: block;
  font-size: clamp(0.95rem, 2.5vh, 1.25rem);
  font-weight: 700;
  margin-bottom: 5px;
}

.port-status {
  display: block;
  font-size: clamp(1rem, 2.8vh, 1.5rem);
  font-weight: 600;
  margin-bottom: 5px;
}

.port-subtext {
  font-size: clamp(0.72rem, 1.8vh, 0.9rem);
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
@media (max-width: 800px), (max-height: 480px) {
  .app-content {
    padding: 8px;
    align-items: flex-start;
    overflow-y: auto;
  }
  
  .view-container {
    gap: 12px;
    padding: 0 2px 10px;
  }
  
  /* Home View Compact */
  .home-view {
    margin-top: 0;
  }

  .status-summary {
    padding: 10px;
    margin-bottom: 8px;
  }

  .section-label {
    font-size: 0.75rem;
    margin-bottom: 8px;
  }

  .mini-status-item {
    padding: 6px 10px;
    gap: 6px;
  }
  
  .action-card {
    height: clamp(100px, 24vh, 140px);
    padding: 12px 8px;
  }
  
  .icon-wrapper {
    font-size: clamp(1.4rem, 5vh, 2rem);
    margin-bottom: 8px;
  }
  
  .card-title {
    font-size: 1.1rem;
  }
  
  .card-desc {
    font-size: 0.8rem;
  }
  
  /* Select Port View Compact */
  .select-port-view {
    gap: 8px;
  }

  .view-title {
    font-size: clamp(1.05rem, 3.3vh, 1.45rem);
    margin-bottom: 4px;
  }

  .view-header-with-action {
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
  }

  .simulate-test-btn {
    font-size: 0.7rem;
    padding: 4px 9px;
  }

  .ports-grid {
    gap: 10px;
  }
  
  .port-card {
    padding: 8px 8px 7px;
    height: auto;
    min-height: 118px;
    justify-content: flex-start;
  }
  
  .port-icon-wrapper {
    width: clamp(38px, 7.2vh, 50px);
    height: clamp(38px, 7.2vh, 50px);
    font-size: 1.25rem;
    margin-bottom: 4px;
  }

  .port-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  
  .port-number {
    font-size: 1rem;
    margin-bottom: 0;
  }
  
  .port-status {
    font-size: 1.02rem;
    margin-bottom: 0;
  }
  
  .port-subtext {
    font-size: 0.72rem;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .back-btn {
    margin-top: 2px;
    padding: 4px 12px;
    font-size: 0.88rem;
  }
}

@media (max-width: 640px) {
  .action-grid,
  .action-grid.three-cols {
    grid-template-columns: 1fr;
  }

  .ports-grid {
    grid-template-columns: 1fr;
  }
}
</style>
