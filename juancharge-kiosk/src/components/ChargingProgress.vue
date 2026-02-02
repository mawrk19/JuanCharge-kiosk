<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { Check, Zap } from 'lucide-vue-next'

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
  statusInterval = setInterval(updateStatus, 1000)
})

onUnmounted(() => {
  if (statusInterval) {
    clearInterval(statusInterval)
  }
})
</script>

<template>
  <div class="progress-view">
    <div class="progress-card glass-panel">
      <!-- Circular Progress -->
      <div class="circular-wrapper">
        <svg class="progress-ring" width="260" height="260">
          <circle
            stroke="rgba(0,0,0,0.05)"
            stroke-width="12"
            fill="transparent"
            r="120"
            cx="130"
            cy="130"
          />
          <circle
            class="progress-ring-circle"
            :stroke="isComplete ? '#38ef7d' : '#11998e'"
            stroke-width="12"
            fill="transparent"
            r="120"
            cx="130"
            cy="130"
            stroke-linecap="round"
            :style="{
              strokeDasharray: `${2 * Math.PI * 120}`,
              strokeDashoffset: `${2 * Math.PI * 120 * (1 - progressPercentage / 100)}`
            }"
          />
        </svg>
        
        <!-- Center Content -->
        <div class="center-content">
          <div v-if="!isComplete" class="timer">
            {{ formatTime(remainingSeconds) }}
          </div>
          <div v-else class="check-icon"><Check :size="80" stroke-width="4" /></div>
          <div class="port-tag">PORT {{ port }}</div>
        </div>
      </div>
      
      <!-- Status Message -->
      <div class="status-box">
        <h2 class="status-main">
          {{ isComplete ? 'Charging Complete' : 'Charging...' }}
        </h2>
        <p class="status-sub">
          {{ isComplete ? 'Thank you for using JuanCharge!' : `${Math.round(progressPercentage)}% Charged` }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.progress-view {
  width: 100%;
  display: flex;
  justify-content: center;
}

.progress-card {
  padding: 50px;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 500px;
}

.circular-wrapper {
  position: relative;
  width: 260px;
  height: 260px;
  margin-bottom: 30px;
}

.progress-ring {
  transform: rotate(-90deg);
}

.progress-ring-circle {
  transition: stroke-dashoffset 0.5s ease, stroke 0.3s ease;
  filter: drop-shadow(0 0 8px rgba(17, 153, 142, 0.5));
}

.center-content {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  width: 100%;
}

.timer {
  font-size: 3.5rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  margin-bottom: 5px;
  color: var(--text-main);
}

.check-icon {
  font-size: 5rem;
  color: var(--secondary);
  line-height: 1;
  animation: scaleIn 0.5s var(--ease-spring);
}

.port-tag {
  font-size: 0.9rem;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--text-muted);
  margin-top: 5px;
}

.status-box {
  text-align: center;
}

.status-main {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 10px;
  color: var(--text-main);
  background: none;
  -webkit-text-fill-color: var(--text-main);
}

.status-sub {
  font-size: 1.1rem;
  color: var(--secondary);
}

@keyframes scaleIn {
  from { transform: scale(0); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@media (max-height: 480px) {
  .progress-card {
    padding: 20px;
    flex-direction: row;
    gap: 40px;
    max-width: 600px;
  }
  
  .circular-wrapper {
    width: 180px;
    height: 180px;
    margin-bottom: 0;
  }
  
  .progress-ring {
    width: 180px;
    height: 180px;
  }
  
  /* Scale SVG internals via CSS transform if needed, or rely on viewBox scaling if responsive */
  .progress-ring {
    transform: rotate(-90deg) scale(0.7); 
    transform-origin: center;
  }
  
  .timer {
    font-size: 2.5rem;
  }
  
  .status-main {
    font-size: 1.5rem;
  }
}
</style>
