<script setup>
import { ref, onMounted } from 'vue'
import QRCode from 'qrcode'

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

const emit = defineEmits(['done'])

const canvasRef = ref(null)

onMounted(() => {
  if (canvasRef.value && props.qrData) {
    QRCode.toCanvas(canvasRef.value, props.qrData, { 
      width: 150,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    }, (error) => {
      if (error) console.error(error)
    })
  }
})
</script>

<template>
  <div class="store-point-view">
    <h1 class="title">Scan to Store Points</h1>
    <div class="qr-container">
      <canvas ref="canvasRef"></canvas>
    </div>
    <div class="points-info">
      <span class="highlight">{{ points }}</span> Points
    </div>
    <p class="instruction">Open the JuanCharge App and scan this code to claim your points.</p>
    
    <button class="done-button" @click="$emit('done')">Done</button>
  </div>
</template>

<style scoped>
.store-point-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  height: 100%;
  color: white;
  animation: fadeIn 0.5s ease-out;
  overflow-y: auto;
  padding: 10px;
}

.title {
  font-size: 1.5rem;
  margin-bottom: 10px;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
}

.qr-container {
  background: white;
  padding: 12px;
  border-radius: 12px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.3);
  margin-bottom: 10px;
}

.points-info {
  font-size: 1.3rem;
  margin-bottom: 8px;
}

.highlight {
  font-weight: bold;
  color: #ffeb3b;
  font-size: 1.8rem;
}

.instruction {
  font-size: 0.85rem;
  margin-bottom: 15px;
  opacity: 0.9;
  max-width: 500px;
  text-align: center;
}

.done-button {
  font-size: 1.1rem;
  padding: 12px 35px;
  background: white;
  color: #11998e;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  font-weight: bold;
  box-shadow: 0 5px 15px rgba(0,0,0,0.2);
  transition: transform 0.2s;
}

.done-button:active {
  transform: scale(0.95);
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
