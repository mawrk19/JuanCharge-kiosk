<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { Check, Zap, XCircle } from 'lucide-vue-next'
import Swal from 'sweetalert2'

const props = defineProps({
  port: {
    type: Number,
    required: true
  },
  totalSeconds: {
    type: Number,
    required: true
  },
  simulate: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['complete', 'cancel'])

const remainingSeconds = ref(props.totalSeconds)
const isComplete = ref(false)
let statusInterval = null

// Format seconds to MM:SS or HH:MM:SS
const formatTime = (seconds) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

// Calculate progress percentage
const progressPercentage = computed(() => {
  if (props.totalSeconds === 0) return 100
  const elapsed = props.totalSeconds - remainingSeconds.value
  return Math.min((elapsed / props.totalSeconds) * 100, 100)
})

// Poll charging status
const updateStatus = async () => {
  if (props.simulate) {
    if (remainingSeconds.value > 0) {
      remainingSeconds.value -= 1
    } else {
      isComplete.value = true
      clearInterval(statusInterval)
      setTimeout(() => {
        emit('complete')
      }, 5000)
    }
    return
  }

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

const handleCancelCharging = async () => {
  const result = await Swal.fire({
    title: 'Cancel Charging Session?',
    html: `<p style="font-size: 1.05rem; margin-bottom: 10px;">Are you sure you want to stop charging on <strong>Port ${props.port}</strong>?</p>
           <p style="color: #dc2626; font-weight: 600; margin-top: 10px;">⚠️ Your used points will NOT be refunded!</p>`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Yes, Stop Charging',
    cancelButtonText: 'Continue Charging',
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#11998e',
    background: '#ffffff',
    color: '#0f172a',
    reverseButtons: true
  })

  if (result.isConfirmed) {
    if (props.simulate) {
      clearInterval(statusInterval)
      emit('cancel')
      return
    }

    try {
      const deactivateResult = await window.electronAPI.invoke('deactivate-charging', {
        port: props.port
      })

      if (deactivateResult.success) {
        clearInterval(statusInterval)
        
        await Swal.fire({
          title: 'Charging Stopped',
          text: `Port ${props.port} has been deactivated.`,
          icon: 'info',
          timer: 2000,
          showConfirmButton: false,
          background: '#ffffff',
          color: '#0f172a'
        })

        emit('cancel')
      } else {
        Swal.fire({
          title: 'Error',
          text: deactivateResult.error || 'Failed to stop charging',
          icon: 'error',
          background: '#ffffff',
          color: '#0f172a'
        })
      }
    } catch (error) {
      console.error('Error canceling charging:', error)
      Swal.fire({
        title: 'Error',
        text: 'An unexpected error occurred',
        icon: 'error',
        background: '#ffffff',
        color: '#0f172a'
      })
    }
  }
}
</script>

<template>
  <div class="progress-view">
    <div class="progress-card glass-panel">
      <!-- Circular Progress -->
      <div class="circular-wrapper">
        <svg class="progress-ring" :viewBox="`0 0 260 260`">
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
      
      <!-- Cancel Button (only show when charging, not when complete) -->
      <button v-if="!isComplete" class="cancel-btn" @click="handleCancelCharging">
        <XCircle :size="20" style="margin-right: 8px" />
        Cancel Session
      </button>
    </div>
  </div>
</template>

<style scoped>
.progress-view {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.progress-card {
  padding: clamp(20px, 5vw, 50px);
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 500px;
  border-radius: var(--radius-lg);
}

.circular-wrapper {
  position: relative;
  width: clamp(180px, 50vw, 260px);
  height: clamp(180px, 50vw, 260px);
  margin-bottom: clamp(20px, 5vw, 30px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.progress-ring {
  width: 100%;
  height: 100%;
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
  font-size: clamp(2rem, 8vw, 3.5rem);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  margin-bottom: clamp(3px, 1vw, 5px);
  color: var(--text-main);
}

.check-icon {
  font-size: clamp(3rem, 10vw, 5rem);
  color: var(--secondary);
  line-height: 1;
  animation: scaleIn 0.5s var(--ease-spring);
}

.port-tag {
  font-size: clamp(0.8rem, 2vw, 0.9rem);
  font-weight: 700;
  letter-spacing: clamp(1px, 0.2vw, 2px);
  color: var(--text-muted);
  margin-top: clamp(3px, 0.5vw, 5px);
}

.status-box {
  text-align: center;
  width: 100%;
}

.status-main {
  font-size: clamp(1.4rem, 4vw, 2rem);
  font-weight: 700;
  margin-bottom: clamp(8px, 2vw, 10px);
  color: var(--text-main);
  background: none;
  -webkit-text-fill-color: var(--text-main);
}

.status-sub {
  font-size: clamp(0.95rem, 2.5vw, 1.1rem);
  color: var(--secondary);
}

.cancel-btn {
  margin-top: clamp(20px, 4vw, 30px);
  padding: clamp(10px, 2vw, 12px) clamp(20px, 4vw, 30px);
  background: rgba(220, 38, 38, 0.1);
  border: 2px solid #dc2626;
  color: #dc2626;
  font-size: clamp(0.9rem, 2vw, 1rem);
  font-weight: 700;
  border-radius: var(--radius-xl);
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  min-width: 44px;
  white-space: nowrap;
}

.cancel-btn:hover {
  background: #dc2626;
  color: white;
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(220, 38, 38, 0.3);
}

.cancel-btn:active {
  transform: translateY(0);
}

@keyframes scaleIn {
  from { transform: scale(0); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

/* Responsive Breakpoints */
@media (max-width: 600px) {
  .progress-card {
    padding: clamp(15px, 3vw, 25px);
  }

  .circular-wrapper {
    width: clamp(160px, 40vw, 200px);
    height: clamp(160px, 40vw, 200px);
  }
}

@media (max-height: 600px) {
  .progress-card {
    padding: clamp(15px, 2vh, 25px);
  }

  .circular-wrapper {
    width: clamp(150px, 30vh, 180px);
    height: clamp(150px, 30vh, 180px);
    margin-bottom: clamp(15px, 2vh, 20px);
  }

  .timer {
    font-size: clamp(1.8rem, 5vh, 2.5rem);
  }

  .status-main {
    font-size: clamp(1.2rem, 2.5vh, 1.5rem);
  }

  .cancel-btn {
    margin-top: clamp(15px, 2vh, 20px);
  }
}

@media (max-height: 500px) {
  .progress-card {
    padding: clamp(12px, 1.5vh, 18px);
    flex-direction: row;
    gap: clamp(20px, 4vw, 30px);
  }

  .circular-wrapper {
    width: clamp(120px, 25vh, 160px);
    height: clamp(120px, 25vh, 160px);
    margin-bottom: 0;
    flex-shrink: 0;
  }

  .status-box {
    flex: 1;
  }

  .status-main {
    font-size: clamp(1rem, 2vh, 1.2rem);
  }

  .status-sub {
    font-size: clamp(0.85rem, 1.5vh, 0.95rem);
  }

  .cancel-btn {
    margin-top: clamp(12px, 1.5vh, 15px);
    width: 100%;
  }
}

@media (max-height: 400px) {
  .circular-wrapper {
    width: clamp(100px, 20vh, 140px);
    height: clamp(100px, 20vh, 140px);
  }

  .timer {
    font-size: clamp(1.5rem, 4vh, 2rem);
  }

  .port-tag {
    display: none;
  }
}

/* Landscape Orientation Optimization */
@media (orientation: landscape) and (max-height: 600px) {
  .progress-card {
    flex-direction: row;
    gap: clamp(20px, 3vw, 40px);
    align-items: center;
  }

  .circular-wrapper {
    margin-bottom: 0;
    flex-shrink: 0;
  }

  .status-box {
    flex: 1;
  }

  .cancel-btn {
    width: 100%;
  }
}

/* Touch Device Optimization */
@media (hover: none) and (pointer: coarse) {
  .cancel-btn {
    min-height: 48px;
    padding: 12px 24px;
  }
}
</style>
