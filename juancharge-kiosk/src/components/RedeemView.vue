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
        <div class="qr-container" @click="handleQrTap">
          <QrcodeVue 
            :value="qrCodeValue" 
            :size="300" 
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
        </div>
        
        <p class="test-hint">💡 Triple-tap QR code for test mode</p>
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
  padding: 40px;
  animation: fadeIn 0.5s ease-in;
}

.title {
  color: white;
  font-size: 4rem;
  margin-bottom: 40px;
  text-align: center;
  font-weight: bold;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.content-container {
  background: white;
  border-radius: 20px;
  padding: 50px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  max-width: 800px;
  width: 100%;
}

.qr-section {
  text-align: center;
}

.qr-container {
  background: white;
  padding: 30px;
  border-radius: 15px;
  display: inline-block;
  margin-bottom: 30px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
}

.qr-code {
  display: block;
}

.instructions {
  margin-bottom: 30px;
  text-align: left;
}

.instruction-title {
  color: #11998e;
  font-size: 2rem;
  margin-bottom: 15px;
  font-weight: bold;
}

.instruction-list {
  color: #333;
  font-size: 1.5rem;
  line-height: 2;
  padding-left: 30px;
}

.instruction-list li {
  margin-bottom: 10px;
}

.test-hint {
  color: rgba(255, 255, 255, 0.6);
  font-size: 1rem;
  margin-top: 20px;
  font-style: italic;
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
  padding: 10px 20px;
  border-radius: 20px;
  font-size: 1.2rem;
  font-weight: bold;
  display: inline-block;
  margin-bottom: 30px;
}

.form-container {
  max-width: 500px;
  margin: 0 auto;
}

.form-group {
  margin-bottom: 20px;
  text-align: left;
}

.form-label {
  display: block;
  color: #333;
  font-size: 1.3rem;
  font-weight: 600;
  margin-bottom: 8px;
}

.form-input {
  width: 100%;
  font-size: 1.5rem;
  padding: 15px 20px;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
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
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 1.2rem;
  margin-bottom: 15px;
  border-left: 4px solid #c62828;
}

.success-message {
  background: #e8f5e9;
  color: #2e7d32;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 1.2rem;
  margin-bottom: 15px;
  border-left: 4px solid #2e7d32;
}

.button-group {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}

.quick-test-button,
.redeem-button {
  flex: 1;
  font-size: 1.3rem;
  padding: 15px 20px;
  border: none;
  border-radius: 10px;
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
  transform: translateY(-2px);
}

.redeem-button {
  background: #11998e;
  color: white;
}

.redeem-button:hover:not(:disabled) {
  background: #0d7a6e;
  transform: translateY(-2px);
}

.redeem-button:disabled,
.quick-test-button:disabled {
  background: #ccc;
  cursor: not-allowed;
  transform: none;
}

.exit-test-button {
  width: 100%;
  font-size: 1.2rem;
  padding: 12px 20px;
  background: #f5f5f5;
  color: #333;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-weight: 600;
}

.exit-test-button:hover {
  background: #e0e0e0;
}

.back-button {
  margin-top: 30px;
  font-size: 1.8rem;
  padding: 20px 40px;
  background: rgba(255, 255, 255, 0.9);
  color: #11998e;
  border: 2px solid white;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-weight: bold;
}

.back-button:hover {
  background: white;
  transform: translateX(-5px);
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
