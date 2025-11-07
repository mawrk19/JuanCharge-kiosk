<script setup>
import { ref, onMounted, defineExpose } from 'vue'

const points = ref(0) // Start at 0, will update when data is loaded
const loading = ref(true)
const error = ref(null)
const date = ref(null)
const itemType = ref(null)
const isPaused = ref(false)
let fetchInterval = null

async function fetchPoints() {
  // Always fetch to check for new data - backend handles showing 0 if reset and no new data
  try {
    loading.value = true
    error.value = null
    
    // Check if electronAPI is available (running in Electron)
    if (window.electronAPI && typeof window.electronAPI.invoke === 'function') {
      console.log('Using Electron API to fetch points from Tracked_json folder')
      console.log('Calling invoke with channel: get-latest-points')
      
      const data = await window.electronAPI.invoke('get-latest-points')
      
      console.log('Received data from Electron:', JSON.stringify(data, null, 2))
      
      if (data && data.error) {
        console.error('Error in response:', data.error)
        throw new Error(data.error)
      }
      
      if (!data) {
        throw new Error('No data received from Electron')
      }
      
      // Update points - backend only counts unused items
      // Points accumulate from new/unused items only
      points.value = data.points || 0
      // Store date/itemType for reference but don't display them
      date.value = data.date || null
      itemType.value = data.itemType || null
      console.log('Points updated:', points.value, 'Unused items:', data.unusedItemCount, 'Total items:', data.itemCount)
    } else {
      // Not in Electron - show error instead of using old JSON
      console.warn('Electron API not available. window.electronAPI:', window.electronAPI)
      throw new Error('Electron API not available. Please run the Electron app to fetch points from Tracked_json folder.')
    }
  } catch (err) {
    console.error('Error fetching points:', err)
    error.value = err.message || 'Failed to load points'
    // Don't reset points to 0 on error if we already have points
    if (points.value === 0) {
      points.value = 0
    }
  } finally {
    loading.value = false
  }
}

async function resetPoints(action = 'store', port = null) {
  try {
    console.log('Resetting points...', action, port)
    
    // Reset points to 0
    points.value = 0
    date.value = null
    itemType.value = null
    
    // Call the reset IPC handler to create new transaction
    if (window.electronAPI && typeof window.electronAPI.invoke === 'function') {
      const result = await window.electronAPI.invoke('reset-points', action, port)
      console.log('Reset result:', result)
      
      if (result.success) {
        // Immediately fetch to show 0 (no new data yet)
        await fetchPoints()
      }
    }
    
    console.log('Points reset to 0, new transaction created')
  } catch (err) {
    console.error('Error resetting points:', err)
  }
}

// Expose reset function to parent component
defineExpose({
  resetPoints
})

onMounted(() => {
  // Debug: Check what's available on window
  console.log('=== PointsDisplay Component Mounted ===');
  console.log('Window object:', window);
  console.log('window.electronAPI:', window.electronAPI);
  console.log('typeof window.electronAPI:', typeof window.electronAPI);
  if (window.electronAPI) {
    console.log('electronAPI.invoke:', typeof window.electronAPI.invoke);
  }
  
  // Wait a bit for Electron API to be ready (max 5 seconds)
  let retries = 0
  const maxRetries = 50
  
  const checkAndFetch = () => {
    if (window.electronAPI && typeof window.electronAPI.invoke === 'function') {
      console.log('✅ Electron API detected, fetching points...')
      fetchPoints()
      // Refresh points every 5 seconds to check for new data
      fetchInterval = setInterval(() => {
        fetchPoints()
      }, 5000)
    } else if (retries < maxRetries) {
      retries++
      if (retries % 10 === 0) { // Log every 10 attempts
        console.log(`⏳ Waiting for Electron API... (attempt ${retries}/${maxRetries})`)
      }
      // Retry after 100ms if API not ready yet
      setTimeout(checkAndFetch, 100)
    } else {
      // Give up after max retries
      console.error('❌ Electron API not available after waiting')
      console.error('window.electronAPI:', window.electronAPI)
      console.error('Available window properties:', Object.keys(window).filter(k => k.includes('electron')))
      error.value = 'Electron API not available. Please make sure you are running the Electron app (npm run electron), not just the dev server.'
      loading.value = false
    }
  }
  
  // Start checking immediately
  checkAndFetch()
})
</script>

<template>
  <div class="points-display">
    <div class="points-container">
      <h2 class="points-title">Available Points</h2>
      <div v-if="loading" class="points-value loading">Loading...</div>
      <div v-else-if="error" class="points-value error">{{ error }}</div>
      <div v-else>
        <div class="points-value">{{ points }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.points-display {
  margin: 20px 0 40px 0;
  text-align: center;
}

.points-container {
  background: rgba(255, 255, 255, 0.2);
  padding: 20px 40px;
  border-radius: 15px;
  backdrop-filter: blur(10px);
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.points-title {
  color: white;
  font-size: 2rem;
  margin: 0 0 10px 0;
  font-weight: normal;
}

.points-value {
  color: white;
  font-size: 3.5rem;
  font-weight: bold;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
}

.points-value.loading {
  font-size: 2rem;
  opacity: 0.8;
}

.points-value.error {
  font-size: 1.5rem;
  color: #ffeb3b;
}

.points-meta {
  color: rgba(255, 255, 255, 0.9);
  font-size: 1.2rem;
  margin-top: 10px;
  font-weight: normal;
}
</style>