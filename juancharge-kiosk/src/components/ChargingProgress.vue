<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'

const props = defineProps({
  port: {
    type: Number,
    required: true
  },
  totalSeconds: {
    type: Number,
    required: true
  }
})

const emit = defineEmits(['complete'])

const remainingSeconds = ref(props.totalSeconds)
const isComplete = ref(false)
let statusInterval = null

// Format seconds to MM:SS or HH:MM:SS
const formatTime = (seconds) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

// Calculate progress percentage
const progressPercentage = computed(() => {
  const elapsed = props.totalSeconds - remainingSeconds.value
  return Math.min((elapsed / props.totalSeconds) * 100, 100)
})

// Poll charging status
const updateStatus = async () => {
  try {
    const result = await window.electronAPI.invoke('get-charging-status')
    
    if (result.success && result.statuses) {
      const portStatus = result.statuses.find(s => s.port === props.port)
      
      if (portStatus) {
        remainingSeconds.value = portStatus.remainingSeconds
        
        // Check if charging is complete
        if (!portStatus.active || portStatus.remainingSeconds === 0) {
          isComplete.value = true
          clearInterval(statusInterval)
          
          // Auto-return to home after 5 seconds
          setTimeout(() => {
            emit('complete')
          }, 5000)
        }
      }
    }
  } catch (error) {
    console.error('Error updating charging status:', error)
  }
}

onMounted(() => {
  // Update status every second
  statusInterval = setInterval(updateStatus, 1000)
})

onUnmounted(() => {
  if (statusInterval) {
    clearInterval(statusInterval)
  }
})
</script>

<template>
  <div class="charging-progress">
    <div class="progress-container">
      <!-- Circular Progress -->
      <div class="circular-progress">
        <svg class="progress-ring" width="200" height="200">
          <circle
            class="progress-ring-bg"
            stroke="#e0e0e0"
            stroke-width="15"
            fill="transparent"
            r="85"
            cx="100"
            cy="100"
          />
          <circle
            class="progress-ring-circle"
            :stroke="isComplete ? '#38ef7d' : '#11998e'"
            stroke-width="15"
            fill="transparent"
            r="85"
            cx="100"
            cy="100"
            :style="{
              strokeDasharray: `${2 * Math.PI * 85}`,
              strokeDashoffset: `${2 * Math.PI * 85 * (1 - progressPercentage / 100)}`
            }"
          />
        </svg>
        
        <!-- Center Content -->
        <div class="progress-center">
          <div v-if="!isComplete" class="time-display">
            {{ formatTime(remainingSeconds) }}
          </div>
          <div v-else class="complete-icon">✓</div>
          <div class="port-label">Port {{ port }}</div>
        </div>
      </div>
      
      <!-- Status Message -->
      <div class="status-message">
        <h2 v-if="!isComplete" class="status-title">Charging in Progress...</h2>
        <h2 v-else class="status-title complete">Charging Complete!</h2>
        <p class="status-subtitle">
          {{ isComplete ? 'Thank you for using JuanCharge!' : `${Math.round(progressPercentage)}% Complete` }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.charging-progress {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  animation: fadeIn 0.5s ease-in;
}

.progress-container {
  text-align: center;
}

.circular-progress {
  position: relative;
  width: 200px;
  height: 200px;
  margin: 0 auto 20px;
}

.progress-ring {
  transform: rotate(-90deg);
}

.progress-ring-circle {
  transition: stroke-dashoffset 0.5s ease, stroke 0.3s ease;
}

.progress-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.time-display {
  font-size: 2.5rem;
  font-weight: bold;
  color: white;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
  margin-bottom: 5px;
}

.complete-icon {
  font-size: 4rem;
  color: #38ef7d;
  animation: scaleIn 0.5s ease-out;
}

.port-label {
  font-size: 1rem;
  color: white;
  font-weight: 600;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
}

.status-message {
  margin-top: 10px;
}

.status-title {
  color: white;
  font-size: 1.8rem;
  margin-bottom: 8px;
  font-weight: bold;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.status-title.complete {
  color: #38ef7d;
}

.status-subtitle {
  color: white;
  font-size: 1.2rem;
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

/* Portrait orientation optimization */
@media (orientation: portrait) {
  .circular-progress {
    width: 250px;
    height: 250px;
  }
  
  .time-display {
    font-size: 3rem;
  }
  
  .status-title {
    font-size: 2.5rem;
  }
  
  .status-subtitle {
    font-size: 1.5rem;
  }
}
</style>
