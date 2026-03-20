<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import QRCode from 'qrcode'
import { CheckCircle } from 'lucide-vue-next'
import Swal from 'sweetalert2'

const props = defineProps({
  qrData: {
    type: String,
    required: true
  },
  points: {
    type: Number,
    required: true
  }
})

const emit = defineEmits(['done', 'cancel'])
const canvasRef = ref(null)

const getQrSize = () => {
  const minSide = Math.min(window.innerWidth, window.innerHeight)
  return Math.max(150, Math.min(300, Math.floor(minSide * 0.42)))
}

const renderQrCode = () => {
  if (!canvasRef.value || !props.qrData) return

  QRCode.toCanvas(canvasRef.value, props.qrData, {
    width: getQrSize(),
    margin: 1,
    errorCorrectionLevel: 'L',
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  }, (error) => {
    if (error) console.error(error)
  })
}

const handleResize = () => {
  renderQrCode()
}

onMounted(() => {
  renderQrCode()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

watch(() => props.qrData, () => {
  renderQrCode()
})


function handleDone() {
  Swal.fire({
    title: 'Points Stored!',
    text: 'Your remaining points have been saved.',
    icon: 'success',
    timer: 2000,
    showConfirmButton: false,
    background: '#ffffff',
    color: '#0f172a'
  }).then(() => {
    emit('done')
  })
}

function handleCancel() {
  emit('cancel')
}
</script>

<template>
  <div class="store-view">
    <h1 class="view-title">Scan to Claim</h1>
    
    <div class="card glass-panel">
      <div class="qr-box">
        <canvas ref="canvasRef"></canvas>
      </div>
      
      <div class="info-box">
        <div class="points-badge">
          <span class="value">{{ points }}</span>
          <span class="label">Points</span>
        </div>
        <p class="instruction">
          Open the <strong>JuanCharge App</strong> and scan the code above to save your points.
        </p>
      </div>
    </div>
    
    <div class="actions">
      <button class="done-btn" @click="handleDone">
        <CheckCircle :size="20" style="margin-right: 8px" /> Done
      </button>
    </div>
  </div>
</template>

<style scoped>
.store-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  gap: clamp(10px, 2.5vh, 20px);
}

.actions {
  display: flex;
  gap: 20px;
  margin-top: 0;
}

.done-btn, .back-btn {
  padding: 10px 26px;
  background: white;
  border: none;
  font-size: clamp(0.9rem, 2.1vh, 1.1rem);
  font-weight: 700;
  border-radius: var(--radius-xl);
  cursor: pointer;
  box-shadow: var(--shadow-lg);
  transition: transform 0.2s, box-shadow 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.done-btn {
  color: var(--primary);
  background: white;
}

.back-btn {
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.5);
}

.done-btn:hover, .back-btn:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 20px rgba(0,0,0,0.15);
}

.view-title {
  font-size: clamp(1.4rem, 4.4vh, 2.2rem);
  font-weight: 700;
  margin-bottom: 0;
}

.card {
  padding: clamp(14px, 3vh, 30px);
  width: 100%;
  max-width: 450px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(10px, 2vh, 20px);
}

.qr-box {
  background: white;
  padding: clamp(8px, 1.5vh, 12px);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.qr-box canvas {
  width: min(100%, 300px);
  height: auto;
}

.info-box {
  text-align: center;
}

.points-badge {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 10px;
}

.points-badge .value {
  font-size: clamp(1.8rem, 5vh, 2.5rem);
  font-weight: 800;
  color: var(--secondary);
  line-height: 1;
  text-shadow: 0 0 20px rgba(56, 239, 125, 0.4);
}

.points-badge .label {
  font-size: 0.9rem;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 2px;
}

.instruction {
  font-size: clamp(0.82rem, 2vh, 1rem);
  line-height: 1.5;
  color: var(--text-main);
  opacity: 0.9;
}

@media (max-width: 800px), (max-height: 480px) {
  .view-title {
    font-size: 1.35rem;
  }
  
  .card {
    padding: 12px;
    gap: 12px;
    flex-direction: row;
    max-width: 600px;
    align-items: center;
  }
  
  .qr-box {
    flex-shrink: 0;
  }

  .qr-box canvas {
    max-width: 180px;
  }
  
  .points-badge .value {
    font-size: 1.8rem;
  }
  
  .instruction {
    font-size: 0.82rem;
  }
  
  .actions {
    gap: 12px;
  }
  
  .done-btn, .back-btn {
    padding: 8px 16px;
    font-size: 0.86rem;
  }
}
</style>
