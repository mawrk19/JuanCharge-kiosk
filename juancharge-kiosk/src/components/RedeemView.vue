<script setup>
import { ref, computed } from 'vue'
import QrcodeVue from 'qrcode.vue'

const emit = defineEmits(['complete'])

// QR Code data for kiosk identification
const kioskData = ref({
  kioskId: 'KIOSK_001',
  action: 'transfer_points',
  timestamp: Date.now()
})

const qrCodeValue = computed(() => JSON.stringify(kioskData.value))

// Hidden test mode for manual redemption (triple-tap QR code to activate)
const testMode = ref(false)
const tapCount = ref(0)
const userId = ref('')
const points = ref('')
const isRedeeming = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

// Triple-tap detection
let tapTimeout = null
const handleQrTap = () => {
  tapCount.value++
  
  if (tapCount.value === 3) {
    testMode.value = !testMode.value
    tapCount.value = 0
    console.log('Test mode:', testMode.value ? 'ENABLED' : 'DISABLED')
  }
  
  // Reset tap count after 1 second
  clearTimeout(tapTimeout)
  tapTimeout = setTimeout(() => {
    tapCount.value = 0
  }, 1000)
}

// Manual redemption for testing
const redeemPoints = async () => {
  errorMessage.value = ''
  successMessage.value = ''
  
  // Validate points input only
  const pointsNum = parseInt(points.value)
  if (!pointsNum || pointsNum <= 0) {
    errorMessage.value = 'Please enter a valid points amount'
    return
  }
  
  isRedeeming.value = true
  
  try {
    // Auto-generate user ID for test mode
    const generatedUserId = 'test_user_' + Date.now()
    
    const result = await window.electronAPI.invoke('redeem-points', {
      userId: generatedUserId,
      points: pointsNum,
      timestamp: Date.now()
    })
    
    if (result.success) {
      successMessage.value = `✅ Redeemed ${pointsNum} points! New balance: ${result.newBalance}`
      
      // Clear form
      points.value = ''
      
      // Return to home after 3 seconds
      setTimeout(() => {
        emit('complete')
      }, 3000)
    } else {
      errorMessage.value = result.error || 'Failed to redeem points'
    }
  } catch (error) {
    console.error('Error redeeming points:', error)
    errorMessage.value = 'System error. Please try again.'
  } finally {
    isRedeeming.value = false
  }
}

// Quick test with mock data
const quickTest = () => {
  points.value = '180'
}

const goBack = () => {
  emit('complete')
}
</script>

<template>
  <div class="redeem-view">
    <h1 class="title">Redeem Points</h1>
    
    <div class="content-container">
      <!-- QR Code Display -->
      <div v-if="!testMode" class="qr-section">
        <div class="qr-content">
          <div class="qr-container" @click="handleQrTap">
            <QrcodeVue 
              :value="qrCodeValue" 
              :size="200" 
              level="H"
              render-as="svg"
              class="qr-code"
            />
          </div>
          
          <div class="instructions">
            <h2 class="instruction-title">How to Redeem:</h2>
            <ol class="instruction-list">
              <li>Open your JuanCharge mobile app</li>
              <li>Scan this QR code</li>
              <li>Select the amount of points to transfer</li>
              <li>Confirm the transfer</li>
            </ol>
            <p class="test-hint">💡 Triple-tap QR for test mode</p>
          </div>
        </div>
      </div>
      
      <!-- Test Mode: Manual Redemption -->
      <div v-else class="test-section">
        <div class="test-badge">🧪 TEST MODE</div>
        
        <div class="form-container">
          <div class="form-group">
            <label for="points" class="form-label">Points to Redeem</label>
            <input
              id="points"
              v-model="points"
              type="number"
              class="form-input"
              placeholder="Enter points amount"
              :disabled="isRedeeming"
              min="1"
            />
          </div>
          
          <div v-if="errorMessage" class="error-message">
            {{ errorMessage }}
          </div>
          
          <div v-if="successMessage" class="success-message">
            {{ successMessage }}
          </div>
          
          <div class="button-group">
            <button 
              class="quick-test-button" 
              @click="quickTest"
              :disabled="isRedeeming"
            >
              Quick Test (180 pts)
            </button>
            
            <button 
              class="redeem-button" 
              @click="redeemPoints"
              :disabled="isRedeeming"
            >
              {{ isRedeeming ? 'Redeeming...' : 'Redeem' }}
            </button>
          </div>
          
          <button class="exit-test-button" @click="testMode = false">
            Exit Test Mode
          </button>
        </div>
      </div>
    </div>
    
    <button class="back-button" @click="goBack">← Back to Home</button>
  </div>
</template>

<style scoped>
.redeem-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 10px;
  animation: fadeIn 0.5s ease-in;
}

.title {
  color: white;
  font-size: 3rem;
  margin-bottom: 10px;
  text-align: center;
  font-weight: bold;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.content-container {
  background: white;
  border-radius: 12px;
  padding: 15px;
  box-shadow: 0 3px 15px rgba(0, 0, 0, 0.3);
  max-width: 600px;
  width: 100%;
}

.qr-section {
  width: 100%;
}

.qr-content {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20px;
}

.qr-container {
  background: white;
  padding: 10px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.qr-code {
  display: block;
}

.instructions {
  flex: 1;
  text-align: left;
}

.instruction-title {
  color: #11998e;
  font-size: 1.1rem;
  margin-bottom: 8px;
  font-weight: bold;
}

.instruction-list {
  color: #333;
  font-size: 1rem;
  line-height: 1.5;
  padding-left: 20px;
  margin: 0;
}

.instruction-list li {
  margin-bottom: 5px;
}

.test-hint {
  color: #999;
  font-size: 0.7rem;
  margin-top: 10px;
  font-style: italic;
  text-align: center;
}

.qr-container {
  cursor: default;
  user-select: none;
}

/* Test Mode Styles */
.test-section {
  width: 100%;
}

.test-badge {
  background: #ff9800;
  color: white;
  padding: 6px 12px;
  border-radius: 15px;
  font-size: 0.9rem;
  font-weight: bold;
  display: inline-block;
  margin-bottom: 15px;
}

.form-container {
  max-width: 400px;
  margin: 0 auto;
}

.form-group {
  margin-bottom: 12px;
  text-align: left;
}

.form-label {
  display: block;
  color: #333;
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 5px;
}

.form-input {
  width: 100%;
  font-size: 1.1rem;
  padding: 10px 15px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  transition: border-color 0.3s ease;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: #11998e;
}

.form-input:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}

.error-message {
  background: #ffebee;
  color: #c62828;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.9rem;
  margin-bottom: 10px;
  border-left: 3px solid #c62828;
}

.success-message {
  background: #e8f5e9;
  color: #2e7d32;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.9rem;
  margin-bottom: 10px;
  border-left: 3px solid #2e7d32;
}

.button-group {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.quick-test-button,
.redeem-button {
  flex: 1;
  font-size: 1rem;
  padding: 12px 15px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-weight: 600;
}

.quick-test-button {
  background: #ff9800;
  color: white;
}

.quick-test-button:hover:not(:disabled) {
  background: #f57c00;
  transform: translateY(-1px);
}

.redeem-button {
  background: #11998e;
  color: white;
}

.redeem-button:hover:not(:disabled) {
  background: #0d7a6e;
  transform: translateY(-1px);
}

.redeem-button:disabled,
.quick-test-button:disabled {
  background: #ccc;
  cursor: not-allowed;
  transform: none;
}

.exit-test-button {
  width: 100%;
  font-size: 0.9rem;
  padding: 10px 15px;
  background: #f5f5f5;
  color: #333;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-weight: 600;
}

.exit-test-button:hover {
  background: #e0e0e0;
}

.back-button {
  margin-top: 8px;
  font-size: 1rem;
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.9);
  color: #11998e;
  border: 2px solid white;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-weight: bold;
}

.back-button:hover {
  background: white;
  transform: translateX(-3px);
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Portrait orientation optimization */
@media (orientation: portrait) {
  .title {
    font-size: 3rem;
  }
  
  .content-container {
    padding: 30px;
  }
  
  .qr-container {
    padding: 20px;
  }
  
  .instruction-title {
    font-size: 1.5rem;
  }
  
  .instruction-list {
    font-size: 1.2rem;
  }
}
</style>
