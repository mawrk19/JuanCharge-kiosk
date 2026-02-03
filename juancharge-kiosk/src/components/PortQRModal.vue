<script setup>
import { ref, onMounted, watch } from 'vue'
import QRCode from 'qrcode'
import { X } from 'lucide-vue-next'

const props = defineProps({
  port: {
    type: Number,
    required: true
  },
  kioskCode: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['close'])
const canvasRef = ref(null)

const generateQR = () => {
  if (canvasRef.value) {
    const payload = {
      action: 'activate_port',
      kiosk_code: props.kioskCode,
      port: props.port
    }
    
    QRCode.toCanvas(canvasRef.value, JSON.stringify(payload), {
      width: 250,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    }, (error) => {
      if (error) console.error(error)
    })
  }
}

onMounted(generateQR)
watch(() => props.port, generateQR)
</script>

<template>
  <div class="qr-modal-overlay" @click.self="emit('close')">
    <div class="qr-modal-content glass-panel">
      <button class="close-btn" @click="emit('close')">
        <X :size="24" />
      </button>
      
      <h2 class="modal-title">Port {{ port }}</h2>
      <p class="modal-subtitle">Scan with Mobile App to Activate</p>
      
      <div class="qr-container">
        <canvas ref="canvasRef"></canvas>
      </div>
      
      <div class="kiosk-info">
        Kiosk: {{ kioskCode }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.qr-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.qr-modal-content {
  background: white;
  padding: 30px;
  border-radius: 24px;
  width: 90%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  box-shadow: 0 20px 50px rgba(0,0,0,0.2);
}

.close-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 5px;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #0f172a;
}

.modal-title {
  font-size: 1.75rem;
  font-weight: 700;
  margin-bottom: 5px;
  color: #0f172a;
}

.modal-subtitle {
  font-size: 0.9rem;
  color: #64748b;
  margin-bottom: 20px;
}

.qr-container {
  background: white;
  padding: 15px;
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  margin-bottom: 20px;
}

.kiosk-info {
  font-size: 0.8rem;
  color: #94a3b8;
  font-family: monospace;
}

/* Compact Adjustments */
@media (max-height: 480px) {
  .qr-modal-content {
    padding: 20px;
    max-width: 320px;
  }
  
  .modal-title {
    font-size: 1.4rem;
    margin-bottom: 2px;
  }
  
  .qr-container {
    padding: 10px;
    margin-bottom: 15px;
  }

  canvas {
    width: 180px !important;
    height: 180px !important;
  }
}
</style>
