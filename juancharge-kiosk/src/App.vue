<script setup>
import { ref } from 'vue'

const currentView = ref('home') // home, selectPort, confirmation
const selectedPort = ref(null)

function goToUseNow() {
  currentView.value = 'selectPort'
}

function goToStorePoint() {
  // TODO: Implement store points functionality
  alert('Store Points feature coming soon!')
}

function selectPort(portNumber) {
  selectedPort.value = portNumber
  currentView.value = 'confirmation'
  
  // Auto-reset to home after 3 seconds
  setTimeout(() => {
    resetToHome()
  }, 3000)
}

function resetToHome() {
  currentView.value = 'home'
  selectedPort.value = null
}
</script>

<template>
  <div class="kiosk-container">
    <!-- Home View: Use Now or Store Point -->
    <div v-if="currentView === 'home'" class="home-view">
      <h1 class="title">JuanCharge Kiosk</h1>
      <div class="button-container">
        <button class="kiosk-button primary" @click="goToUseNow">
          Use Now
        </button>
        <button class="kiosk-button secondary" @click="goToStorePoint">
          Store Point
        </button>
      </div>
    </div>

    <!-- Select Port View -->
    <div v-if="currentView === 'selectPort'" class="select-port-view">
      <h1 class="title">Select a Port</h1>
      <div class="button-container">
        <button class="kiosk-button port" @click="selectPort(1)">
          Port 1
        </button>
        <button class="kiosk-button port" @click="selectPort(2)">
          Port 2
        </button>
        <button class="kiosk-button port" @click="selectPort(3)">
          Port 3
        </button>
      </div>
      <button class="back-button" @click="resetToHome">← Back</button>
    </div>

    <!-- Confirmation View -->
    <div v-if="currentView === 'confirmation'" class="confirmation-view">
      <div class="confirmation-content">
        <div class="checkmark">✓</div>
        <h1 class="confirmation-title">Port {{ selectedPort }} is available for charging</h1>
        <p class="confirmation-subtitle">Thank you!</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kiosk-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
  padding: 40px;
  box-sizing: border-box;
}

.title {
  color: white;
  font-size: 4rem;
  margin-bottom: 60px;
  text-align: center;
  font-weight: bold;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.button-container {
  display: flex;
  flex-direction: row;
  gap: 30px;
  width: 100%;
  max-width: 1400px;
}

.kiosk-button {
  font-size: 3rem;
  padding: 80px 100px;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.3s ease;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  text-transform: uppercase;
  letter-spacing: 2px;
  flex: 1;
}

.kiosk-button:hover {
  transform: translateY(-5px);
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.4);
}

.kiosk-button:active {
  transform: translateY(-2px);
}

.kiosk-button.primary {
  background: white;
  color: #11998e;
  border: 4px solid #11998e;
}

.kiosk-button.secondary {
  background: #2d6a4f;
  color: white;
}

.kiosk-button.port {
  background: white;
  color: #11998e;
  border: 4px solid #38ef7d;
}

.back-button {
  margin-top: 40px;
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

.confirmation-view {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.confirmation-content {
  text-align: center;
  animation: fadeIn 0.5s ease-in;
}

.checkmark {
  font-size: 10rem;
  color: #38ef7d;
  margin-bottom: 30px;
  animation: scaleIn 0.5s ease-out;
}

.confirmation-title {
  color: white;
  font-size: 3.5rem;
  margin-bottom: 20px;
  font-weight: bold;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.confirmation-subtitle {
  color: white;
  font-size: 2.5rem;
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
  .button-container {
    flex-direction: column;
    max-width: 600px;
  }
  
  .kiosk-container {
    padding: 60px 30px;
  }
  
  .title {
    font-size: 3.5rem;
  }
  
  .kiosk-button {
    font-size: 2.5rem;
    padding: 50px 60px;
  }
}
</style>
