<script setup>
import { ref, onMounted, defineExpose, computed } from 'vue'
import { Zap } from 'lucide-vue-next'

const points = ref(0) // Start at 0, will update when data is loaded
const loading = ref(true)
const error = ref(null)
const date = ref(null)
const itemType = ref(null)
const fetchInterval = null

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
      
      // Update points - backend only counts unused items
      points.value = data.points || 0
      date.value = data.date || null
      itemType.value = data.itemType || null
    } else {
      // Not in Electron
      console.warn('Electron API not available.')
      // For dev/demo purposes, maybe don't throw if just testing UI
      // throw new Error('Electron API not available.')
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
      loading.value = false // Stop loading state if no API
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
      <div class="footer-info">JuanCharge Wallet</div>
    </div>
  </div>
</template>

<style scoped>
.points-display-card {
  width: 100%;
  max-width: 600px; /* Wider card */
  padding: 30px;
  background: white;
  border: 1px solid rgba(0,0,0,0.05);
  display: flex;
  flex-direction: column;
  gap: 20px;
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
  font-size: 0.9rem;
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

.points-content {
  text-align: center;
  padding: 10px 0;
}

.points-value {
  font-size: 5rem;
  font-weight: 800;
  line-height: 1;
  background: linear-gradient(to bottom, var(--primary), var(--secondary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 4px 10px rgba(0,0,0,0.1));
}

.unit {
  font-size: 1.5rem;
  font-weight: 500;
  color: var(--text-muted);
  -webkit-text-fill-color: var(--text-muted); /* Override gradient */
}

.time-estimate {
  margin-top: 15px;
  font-size: 1.1rem;
  color: var(--secondary);
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(56, 239, 125, 0.1);
  padding: 8px 16px;
  border-radius: 20px;
  display: inline-flex;
}

.card-footer {
  border-top: 1px solid rgba(0,0,0,0.05);
  padding-top: 15px;
  text-align: right;
}

.footer-info {
  font-size: 0.8rem;
  color: var(--text-dim);
  font-family: monospace;
}

@media (max-height: 480px) {
  .points-display-card {
    padding: 15px;
    gap: 10px;
    max-width: 500px;
  }
  
  .points-value {
    font-size: 3.5rem;
  }
  
  .unit {
    font-size: 1.2rem;
  }
  
  .time-estimate {
    font-size: 1rem;
    margin-top: 5px;
    padding: 5px 12px;
  }
  
  .label {
    font-size: 0.8rem;
  }
}
</style>