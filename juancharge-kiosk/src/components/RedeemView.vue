<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import QrcodeVue from 'qrcode.vue'
import { QrCode, Smartphone, CheckCircle } from 'lucide-vue-next'
import Swal from 'sweetalert2'

const emit = defineEmits(['complete', 'hideDevMode'])

// QR Code data for kiosk identification
const kioskData = ref({
  kioskId: 'KIOSK_001',
  action: 'transfer_points',
  timestamp: Date.now()
})

const qrCodeValue = computed(() => JSON.stringify(kioskData.value))
const qrSize = ref(220)

// Hidden test mode for manual redemption (triple-tap QR code to activate)
const testMode = ref(false)
const tapCount = ref(0)
const userIdInput = ref('') // Used for manual test input
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
    // Use input user ID or auto-generate
    const generatedUserId = userIdInput.value ? userIdInput.value.trim() : 'test_user_' + Date.now()
    
    let result
    if (window.electronAPI) {
      result = await window.electronAPI.invoke('redeem-points', {
        userId: generatedUserId,
        points: pointsNum,
        timestamp: Date.now()
      })
    } else {
      // Mock result for browser testing
      console.warn('Electron API not found, simulating success')
      await new Promise(r => setTimeout(r, 1000))
      
      const currentMockPoints = parseInt(localStorage.getItem('juancharge-mock-points') || '0')
      const newBalance = currentMockPoints + pointsNum
      localStorage.setItem('juancharge-mock-points', newBalance.toString())
      
      result = { success: true, newBalance: newBalance }
    }
    
    if (result.success) {
      setTimeout(() => {
        Swal.fire({
          title: 'Redemption Success!',
          text: `Successfully redeemed ${pointsNum} points. New balance: ${result.newBalance}`,
          icon: 'success',
          timer: 2000,
          showConfirmButton: false,
          background: '#ffffff',
          color: '#0f172a'
        }).then(() => {
          emit('complete')
        })
      }, 500)
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

const quickTest = () => {
  userIdInput.value = '1'
  points.value = '50'
}

const goBack = () => {
  emit('complete')
}

const hideDevMode = () => {
  emit('hideDevMode')
}

const updateQrSize = () => {
  const minSide = Math.min(window.innerWidth, window.innerHeight)
  qrSize.value = Math.max(140, Math.min(220, Math.floor(minSide * 0.46)))
}

onMounted(() => {
  updateQrSize()
  window.addEventListener('resize', updateQrSize)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateQrSize)
})
</script>

<template>
  <div class="redeem-layout">
    <h2 class="view-title">Redeem Points</h2>
    
    <div class="content-card glass-panel">
      <!-- QR Code Display -->
      <div v-if="!testMode" class="qr-section">
        <div class="qr-wrapper" @click="handleQrTap">
          <QrcodeVue 
            :value="qrCodeValue" 
            :size="qrSize" 
            level="H"
            render-as="svg"
            class="qr-code"
          />
        </div>
        
        <div class="instructions">
          <h3><Smartphone :size="20" class="step-icon" /> Open JuanCharge App</h3>
          <h3><QrCode :size="20" class="step-icon" /> Scan QR Code</h3>
          <h3><CheckCircle :size="20" class="step-icon" /> Transfer Points</h3>
        </div>
      </div>
      
      <!-- Test Mode: Manual Redemption -->
      <div v-else class="test-section">
        <div class="test-badge">🧪 TEST MODE</div>
        
        <div class="form-container">
          <div class="form-group">
            <label for="userId">User ID (Optional)</label>
            <input
              id="userId"
              v-model="userIdInput"
              type="text"
              class="form-input"
              placeholder="Auto-generated if empty"
              :disabled="isRedeeming"
            />
          </div>

          <div class="form-group">
            <label for="points">Points to Redeem</label>
            <input
              id="points"
              v-model="points"
              type="number"
              class="form-input"
              placeholder="e.g. 100"
              :disabled="isRedeeming"
              min="1"
            />
          </div>
          
          <div v-if="errorMessage" class="msg error">{{ errorMessage }}</div>
          <div v-if="successMessage" class="msg success">{{ successMessage }}</div>
          
          <div class="btn-group">
            <button class="btn secondary" @click="quickTest" :disabled="isRedeeming">Mock User 1</button>
            <button class="btn primary" @click="redeemPoints" :disabled="isRedeeming">
              {{ isRedeeming ? 'Processing...' : 'Redeem' }}
            </button>
          </div>
          
          <button class="btn text-only" @click="testMode = false">Exit Test Mode</button>
        </div>
      </div>
    </div>
    
    <div class="footer-actions">
      <button class="back-link" @click="goBack">Cancel</button>
      <button class="hide-btn" @click="hideDevMode">Hide Dev Mode</button>
    </div>
  </div>
</template>

<style scoped>
.redeem-layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  gap: clamp(10px, 2.5vh, 20px);
}

.view-title {
  font-size: clamp(1.4rem, 5vh, 2.5rem);
  font-weight: 700;
  margin-bottom: 0;
}

.content-card {
  padding: clamp(14px, 4vh, 40px);
  width: 100%;
  max-width: 500px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* QR Section */
.qr-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(12px, 2.8vh, 30px);
  width: 100%;
}

.qr-wrapper {
  background: white;
  padding: clamp(8px, 1.8vh, 15px);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.instructions {
  display: flex;
  flex-direction: column;
  gap: clamp(8px, 1.8vh, 15px);
  width: 100%;
}

.instructions h3 {
  display: flex;
  align-items: center;
  gap: 15px;
  font-size: clamp(0.85rem, 2.2vh, 1.1rem);
  font-weight: 500;
  margin: 0;
}

.step-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(17, 153, 142, 0.1);
  border: 1px solid var(--primary);
  color: var(--primary);
  font-weight: 700;
}

/* Test Section */
.test-section {
  width: 100%;
  text-align: center;
}

.test-badge {
  background: var(--accent-red);
  color: white;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 700;
  display: inline-block;
  margin-bottom: 20px;
}

.form-group {
  text-align: left;
  margin-bottom: clamp(10px, 2vh, 20px);
}

.form-group label {
  display: block;
  font-size: 0.9rem;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.form-input {
  width: 100%;
  padding: clamp(8px, 1.8vh, 12px);
  border-radius: var(--radius-sm);
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: white;
  color: var(--text-main);
  font-size: clamp(0.9rem, 2vh, 1.1rem);
  outline: none;
}

.form-input:focus {
  border-color: var(--primary);
}

.btn-group {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}

.btn {
  flex: 1;
  padding: clamp(8px, 1.8vh, 12px);
  border-radius: var(--radius-sm);
  border: none;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  background: var(--primary);
  color: white;
}

.btn.secondary {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-main);
}

.btn.text-only {
  background: none;
  color: var(--text-muted);
  font-size: 0.9rem;
  margin-top: 10px;
}

.msg {
  padding: 10px;
  border-radius: var(--radius-sm);
  margin-bottom: 15px;
  font-size: 0.9rem;
}

.msg.error {
  background: rgba(255, 71, 87, 0.2);
  color: #ff4757;
}

.msg.success {
  background: rgba(56, 239, 125, 0.2);
  color: #38ef7d;
}

.back-link:hover, .hide-btn:hover {
  color: var(--primary);
}

.footer-actions {
  display: flex;
  gap: 30px;
  margin-top: 0;
  flex-wrap: wrap;
  justify-content: center;
}

.hide-btn {
  background: none;
  border: none;
  color: var(--accent-red);
  cursor: pointer;
  font-size: 0.9rem;
  opacity: 0.7;
}

.hide-btn:hover {
  opacity: 1;
  text-decoration: underline;
}

@media (max-width: 800px), (max-height: 480px) {
  .view-title {
    font-size: 1.3rem;
  }
  
  .content-card {
    padding: 12px;
    flex-direction: row;
    gap: 12px;
    max-width: 650px;
    align-items: center;
  }
  
  .qr-section {
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }
  
  .qr-wrapper {
    padding: 8px;
  }
  
  .qr-code {
    width: clamp(130px, 32vh, 170px) !important;
    height: auto !important;
  }
  
  .instructions h3 {
    font-size: 0.8rem;
    margin-bottom: 2px;
  }
  
  .step-num {
    width: 24px;
    height: 24px;
    font-size: 0.9rem;
  }
  
  .test-badge {
    margin-bottom: 8px;
  }
  
  .form-group {
    margin-bottom: 8px;
  }
  
  .btn {
    padding: 7px;
    font-size: 0.85rem;
  }

  .footer-actions {
    gap: 12px;
  }
}
</style>
