<script setup>
import { ref, onMounted, defineExpose, computed } from 'vue'
import { Zap } from 'lucide-vue-next'
import Swal from 'sweetalert2'

const points = ref(0) // Start at 0, will update when data is loaded
const loading = ref(true)
const error = ref(null)
const date = ref(null)
const itemType = ref(null)
const fetchInterval = null

const walletClickCount = ref(0)
let walletClickTimeout = null

async function fetchPoints() {
  // Always fetch to check for new data - backend handles showing 0 if reset and no new data
  try {
    loading.value = true
    error.value = null
    
    // Check if electronAPI is available (running in Electron)
    if (window.electronAPI && typeof window.electronAPI.invoke === 'function') {
      const data = await window.electronAPI.invoke('get-latest-points')
      
      if (data && data.error) {
        throw new Error(data.error)
      }
      
      if (!data) {
        throw new Error('No data received from Electron')
      }

      // Show rejection modal(s) when items are rejected by scanner category rules
      if (Array.isArray(data.rejections) && data.rejections.length > 0) {
        showRejectionNotification(data.rejections)
      }
      
      // Update points - backend only counts unused items
      points.value = data.points || 0
      date.value = data.date || null
      itemType.value = data.itemType || null
    } else {
      // Not in Electron - Mock Data
      console.warn('Electron API not available. Using local mock data.')
      
      // Simulate network delay
      await new Promise(r => setTimeout(r, 500))
      
      const stored = localStorage.getItem('juancharge-mock-points')
      if (stored === null) {
        // Init if empty
        localStorage.setItem('juancharge-mock-points', '0')
        points.value = 0
      } else {
        points.value = parseInt(stored)
      }
    }
  } catch (err) {
    console.error('Error fetching points:', err)
    error.value = err.message || 'Failed to load points'
    if (points.value === 0) {
      points.value = 0
    }
  } finally {
    loading.value = false
  }
}

async function resetPoints(action = 'store', port = null) {
  try {
    points.value = 0
    date.value = null
    itemType.value = null
    
    if (window.electronAPI && typeof window.electronAPI.invoke === 'function') {
      const result = await window.electronAPI.invoke('reset-points', action, port)
      if (result.success) {
        await fetchPoints()
        return result
      }
      return result
    }
  } catch (err) {
    console.error('Error resetting points:', err)
  }
}

// Manual refresh
async function refreshPoints() {
  await fetchPoints()
}

// Helper to convert points to time display
function convertPointsToTime(pts) {
  const seconds = pts * 60
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes} min`
}

function showRejectionNotification(rejections) {
  const byType = rejections.reduce((acc, item) => {
    const type = item.rejection_type || 'Rejected'
    if (!acc[type]) acc[type] = []
    acc[type].push(item.rejection_reason || 'No rejection reason provided')
    return acc
  }, {})

  const htmlContent = Object.entries(byType).map(([type, reasons]) => {
    const uniqueReasons = Array.from(new Set(reasons))
    return `<strong>${type}</strong>: ${uniqueReasons.map(r => `${r}`).join('<br>')}`
  }).join('<hr>')

  Swal.fire({
    title: 'Rejected item(s) detected',
    html: htmlContent || 'No details available',
    icon: 'error',
    timer: 5000,
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    background: '#ffdddd',
    color: '#7f1d1d',
    timerProgressBar: true,
    customClass: {
      popup: 'rejection-alert-popup',
      title: 'rejection-alert-title',
      htmlContainer: 'rejection-alert-text'
    }
  })
}

async function injectDebugRejectedItem() {
  if (!window.electronAPI || typeof window.electronAPI.invoke !== 'function') {
    console.error('electronAPI.invoke not available')
    return
  }

  try {
    const result = await window.electronAPI.invoke('add-debug-rejected-item')

    if (result.success) {
      Swal.fire({
        title: 'Test item added',
        text: 'Rejected test item inserted into tracked_tracked.json',
        icon: 'success',
        timer: 1700,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        background: '#dcfce7',
        color: '#166534'
      })

      await fetchPoints()
    } else {
      Swal.fire({
        title: 'Failed',
        text: result.error || 'Could not add debug item',
        icon: 'error',
        timer: 2500,
        toast: true,
        position: 'top-end',
        showConfirmButton: false
      })
    }
  } catch (err) {
    console.error('Failed to add debug rejected item:', err)
  }
}

function handleWalletTitlePress() {
  walletClickCount.value += 1

  if (walletClickTimeout) {
    clearTimeout(walletClickTimeout)
  }

  walletClickTimeout = setTimeout(() => {
    walletClickCount.value = 0
  }, 1500)

  if (walletClickCount.value >= 3) {
    walletClickCount.value = 0
    injectDebugRejectedItem()
  }
}

defineExpose({
  resetPoints,
  refreshPoints,
  get points() {
    return points.value
  }
})

onMounted(() => {
  if (window.electronAPI && typeof window.electronAPI.on === 'function') {
    window.electronAPI.on('points-updated', (data) => {
      points.value = data.points;
      loading.value = false;
      error.value = null;
    });
  }
  
  // Initial check
  if (window.electronAPI && typeof window.electronAPI.invoke === 'function') {
    fetchPoints()
    // Poll less frequently as backup
    setInterval(fetchPoints, 30000)
  } else {
      fetchPoints() // Fetch mock data
      // loading.value = false // handled in fetchPoints
  }
})
</script>

<template>
  <div class="points-display-card glass-panel">
    <div class="card-header">
      <span class="label">Digital Balance</span>
      <div v-if="loading" class="status-indicator loading"></div>
      <div v-else-if="error" class="status-indicator error">!</div>
      <div v-else class="status-indicator active"></div>
    </div>
    
    <div class="points-content">
      <div class="points-value">
        {{ points }}
        <span class="unit">pts</span>
      </div>
      
      <div class="time-estimate">
        <Zap :size="18" class="icon" />
        {{ points > 0 ? `≈ ${convertPointsToTime(points)} charging time` : 'Scan voucher or manual to add points' }}
      </div>
    </div>
    
    <div class="card-footer">
      <div class="footer-info" @click="handleWalletTitlePress" title="Debug: tap 3x for rejection test">JuanCharge Wallet</div>
    </div>
  </div>
</template>

<style scoped>
.points-display-card {
  width: 100%;
  max-width: 600px; /* Wider card */
  padding: clamp(12px, 3vh, 30px);
  background: white;
  border: 1px solid rgba(0,0,0,0.05);
  display: flex;
  flex-direction: column;
  gap: clamp(8px, 2vh, 20px);
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow-lg);
  border-radius: var(--radius-lg);
}

/* Shine effect */
.points-display-card::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
  transform: skewX(-20deg);
  animation: shine 8s infinite;
}

@keyframes shine {
  0% { left: -100%; }
  20% { left: 200%; }
  100% { left: 200%; }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.label {
  font-size: clamp(0.7rem, 1.8vh, 0.9rem);
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--text-muted);
  font-weight: 600;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-indicator.active {
  background: var(--secondary);
  box-shadow: 0 0 10px var(--secondary);
}

.status-indicator.loading {
  background: var(--text-muted);
  animation: pulse 1s infinite;
}

.status-indicator.error {
  background: var(--accent-red);
}

.rejection-alert-popup {
  border-left: 6px solid #dc2626; /* red accent */
  box-shadow: 0 0 20px rgba(220, 38, 38, 0.35);
}

.rejection-alert-title {
  color: #b91c1c !important;
}

.rejection-alert-text {
  color: #7f1d1d;
}

.points-content {
  text-align: center;
  padding: 2px 0;
}

.points-value {
  font-size: clamp(2.4rem, 12vh, 5rem);
  font-weight: 800;
  line-height: 1;
  background: linear-gradient(to bottom, var(--primary), var(--secondary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 4px 10px rgba(0,0,0,0.1));
}

.unit {
  font-size: clamp(0.95rem, 3.4vh, 1.5rem);
  font-weight: 500;
  color: var(--text-muted);
  -webkit-text-fill-color: var(--text-muted); /* Override gradient */
}

.time-estimate {
  margin-top: clamp(6px, 1.6vh, 15px);
  font-size: clamp(0.78rem, 2.2vh, 1.1rem);
  color: var(--secondary);
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
  background: rgba(56, 239, 125, 0.1);
  padding: clamp(4px, 1.2vh, 8px) clamp(10px, 2vw, 16px);
  border-radius: 20px;
  display: inline-flex;
}

.card-footer {
  border-top: 1px solid rgba(0,0,0,0.05);
  padding-top: clamp(6px, 1.5vh, 15px);
  text-align: right;
}

.footer-info {
  font-size: clamp(0.65rem, 1.5vh, 0.8rem);
  color: var(--text-dim);
  font-family: monospace;
}

@media (max-width: 800px), (max-height: 480px) {
  .points-display-card {
    padding: 12px;
    gap: 8px;
    max-width: 500px;
  }
  
  .points-value {
    font-size: clamp(2rem, 10vh, 3.4rem);
  }
  
  .unit {
    font-size: 1rem;
  }
  
  .time-estimate {
    font-size: 0.78rem;
    margin-top: 3px;
    padding: 4px 10px;
  }
  
  .label {
    font-size: 0.68rem;
    letter-spacing: 1px;
  }
}
</style>