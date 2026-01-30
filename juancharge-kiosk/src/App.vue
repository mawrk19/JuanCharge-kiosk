<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import PointsDisplay from './components/PointsDisplay.vue'
import StorePointView from './components/StorePointView.vue'
import RedeemView from './components/RedeemView.vue'
import ChargingProgress from './components/ChargingProgress.vue'

const currentView = ref('home') // home, selectPort, confirmation, storePoint, redeem, charging
const selectedPort = ref(null)
const pointsDisplayRef = ref(null)
const storedQrData = ref('')
const storedPoints = ref(0)
const portStatuses = ref([null, null, null]) // Status for ports 1, 2, 3
const currentPoints = ref(0)
const chargingDuration = ref(0)
let statusInterval = null

// Poll port statuses
const updatePortStatuses = async () => {
  try {
    const result = await window.electronAPI.invoke('get-charging-status')
    if (result.success && result.statuses) {
      portStatuses.value = result.statuses
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
  
  // Start polling port statuses every 2 seconds
  updatePortStatuses()
  statusInterval = setInterval(updatePortStatuses, 2000)
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

async function goToStorePoint() {
  // Reset points when Store Point button is clicked
  if (pointsDisplayRef.value && pointsDisplayRef.value.resetPoints) {
    const result = await pointsDisplayRef.value.resetPoints('store', null)
    
    if (result && result.qrData && result.storedPoints > 0) {
      storedQrData.value = result.qrData
      storedPoints.value = result.storedPoints
      currentView.value = 'storePoint'
    } else {
      // Fallback or 0 points
      alert('Points have been reset to 0! (No points to store)')
    }
  } else {
    alert('System error: Points display not ready')
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
    return 'port in-use'
  }
  
  if (currentPoints.value <= 0) {
    return 'port no-points'
  }
  
  return 'port available'
}

// Get port button text
function getPortButtonText(portNumber) {
  const portStatus = portStatuses.value.find(s => s && s.port === portNumber)
  
  if (portStatus && portStatus.active) {
    return `Port ${portNumber}\nIn Use\n${formatTime(portStatus.remainingSeconds)} left`
  }
  
  if (currentPoints.value <= 0) {
    return `Port ${portNumber}\nNo Points Available`
  }
  
  return `Port ${portNumber}\nAvailable\n~${formatTime(currentPoints.value * 60)}`
}

// Check if port is disabled
function isPortDisabled(portNumber) {
  const portStatus = portStatuses.value.find(s => s && s.port === portNumber)
  return (portStatus && portStatus.active) || currentPoints.value <= 0
}
</script>

<template>
  <div class="kiosk-container">
    <!-- Home View -->
    <div v-if="currentView === 'home'" class="home-view">
      <h1 class="title">JuanCharge Kiosk</h1>
      <PointsDisplay ref="pointsDisplayRef" />
      
      <!-- Active Ports Status -->
      <div v-if="portStatuses.some(p => p && p.active)" class="active-ports-status">
        <h3 class="status-title">⚡ Active Charging Sessions</h3>
        <div class="active-ports-list">
          <div 
            v-for="status in portStatuses.filter(p => p && p.active)" 
            :key="status.port"
            class="active-port-item"
          >
            <span class="port-label">Port {{ status.port }}</span>
            <span class="time-remaining">{{ formatTime(status.remainingSeconds) }} left</span>
          </div>
        </div>
      </div>
      
      <div class="button-container">
        <button class="kiosk-button primary" @click="goToUseNow">
          Use Now
        </button>
        <button class="kiosk-button secondary" @click="goToStorePoint">
          Store Point
        </button>
        <button class="kiosk-button tertiary" @click="goToRedeem">
          Redeem Points
        </button>
      </div>
    </div>
    
    <!-- Hidden PointsDisplay for ref access in other views -->
    <PointsDisplay v-else ref="pointsDisplayRef" class="points-hidden" />

    <!-- Select Port View -->
    <div v-if="currentView === 'selectPort'" class="select-port-view">
      <h1 class="title">Select a Port</h1>
      <div class="button-container">
        <button 
          v-for="port in [1, 2, 3]" 
          :key="port"
          :class="['kiosk-button', getPortButtonClass(port)]" 
          @click="selectPort(port)"
          :disabled="isPortDisabled(port)"
        >
          <span class="port-text" v-html="getPortButtonText(port).replace(/\n/g, '<br>')" />
        </button>
      </div>
      <button class="back-button" @click="resetToHome">← Back</button>
    </div>

    <!-- Confirmation View -->
    <div v-if="currentView === 'confirmation'" class="confirmation-view">
      <div class="confirmation-content">
        <div class="checkmark">✓</div>
        <h1 class="confirmation-title">Port {{ selectedPort }} is available for charging</h1>
        <p class="confirmation-subtitle">Thank you!</p>
      </div>
    </div>

    <!-- Store Point View -->
    <div v-if="currentView === 'storePoint'" class="store-point-container">
      <StorePointView 
        :qrData="storedQrData" 
        :points="storedPoints" 
        @done="resetToHome" 
      />
    </div>
    
    <!-- Redeem View -->
    <div v-if="currentView === 'redeem'" class="redeem-container">
      <RedeemView @complete="onRedeemComplete" />
    </div>
    
    <!-- Charging Progress View -->
    <div v-if="currentView === 'charging'" class="charging-container">
      <ChargingProgress 
        :port="selectedPort" 
        :totalSeconds="chargingDuration"
        @complete="onChargingComplete" 
      />
    </div>
  </div>
</template>

<style scoped>
.kiosk-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
  padding: 40px;
  box-sizing: border-box;
}

.title {
  color: white;
  font-size: 4rem;
  margin-bottom: 60px;
  text-align: center;
  font-weight: bold;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.button-group {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  max-width: 500px;
}

.active-ports-status {
  background: rgba(255, 255, 255, 0.15);
  padding: 20px;
  border-radius: 15px;
  margin: 20px 0;
  backdrop-filter: blur(10px);
  border: 2px solid rgba(255, 255, 255, 0.25);
}

.status-title {
  color: white;
  font-size: 1.8rem;
  margin: 0 0 15px 0;
  font-weight: 600;
}

.active-ports-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.active-port-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(76, 175, 80, 0.3);
  padding: 12px 20px;
  border-radius: 10px;
  border-left: 4px solid #4caf50;
}

.port-label {
  color: white;
  font-size: 1.5rem;
  font-weight: 600;
}

.time-remaining {
  color: rgba(255, 255, 255, 0.95);
  font-size: 1.3rem;
  font-weight: 500;
}

.action-button {
  font-size: 2rem;
  padding: 20px 40px;
  border: none;
  border-radius: 15px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-weight: bold;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}
.button-container {
  display: flex;
  flex-direction: row;
  gap: 30px;
  width: 100%;
  max-width: 1400px;
}

.kiosk-button {
  font-size: 3rem;
  padding: 80px 100px;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.3s ease;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  text-transform: uppercase;
  letter-spacing: 2px;
  flex: 1;
}

.kiosk-button:hover {
  transform: translateY(-5px);
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.4);
}

.kiosk-button:active {
  transform: translateY(-2px);
}

.kiosk-button.primary {
  background: white;
  color: #11998e;
  border: 4px solid #11998e;
}

.kiosk-button.secondary {
  background: #2d6a4f;
  color: white;
}

.kiosk-button.tertiary {
  background: #ff6b6b;
  color: white;
}

.kiosk-button.port {
  background: white;
  color: #11998e;
  border: 4px solid #38ef7d;
  position: relative;
}

.kiosk-button.port.available {
  background: white;
  color: #11998e;
  border: 4px solid #38ef7d;
}

.kiosk-button.port.in-use {
  background: #ffebee;
  color: #c62828;
  border: 4px solid #ef5350;
  cursor: not-allowed;
  opacity: 0.7;
}

.kiosk-button.port.no-points {
  background: #f5f5f5;
  color: #9e9e9e;
  border: 4px solid #e0e0e0;
  cursor: not-allowed;
  opacity: 0.6;
}

.kiosk-button.port:disabled {
  transform: none;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
}

.port-text {
  display: block;
  line-height: 1.4;
}

.back-button {
  margin-top: 40px;
  font-size: 1.8rem;
  padding: 20px 40px;
  background: rgba(255, 255, 255, 0.9);
  color: #11998e;
  border: 2px solid white;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-weight: bold;
}

.back-button:hover {
  background: white;
  transform: translateX(-5px);
}

.confirmation-view, .store-point-container, .redeem-container, .charging-container {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.confirmation-content {
  text-align: center;
  animation: fadeIn 0.5s ease-in;
}

.checkmark {
  font-size: 10rem;
  color: #38ef7d;
  margin-bottom: 30px;
  animation: scaleIn 0.5s ease-out;
}

.confirmation-title {
  color: white;
  font-size: 3.5rem;
  margin-bottom: 20px;
  font-weight: bold;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.confirmation-subtitle {
  color: white;
  font-size: 2.5rem;
  font-weight: 300;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes scaleIn {
  from {
    transform: scale(0);
  }
  to {
    transform: scale(1);
  }
}

.points-hidden {
  position: absolute;
  visibility: hidden;
  pointer-events: none;
  width: 0;
  height: 0;
  overflow: hidden;
  opacity: 0;
}

/* Portrait orientation optimization */
@media (orientation: portrait) {
  .button-container {
    flex-direction: column;
    max-width: 600px;
  }
  
  .kiosk-container {
    padding: 60px 30px;
  }
  
  .title {
    font-size: 3.5rem;
  }
  
  .kiosk-button {
    font-size: 2.5rem;
    padding: 50px 60px;
  }
}
</style>
