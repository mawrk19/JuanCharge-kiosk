<script setup>
import { Zap } from 'lucide-vue-next'

defineEmits(['dismiss'])
</script>

<template>
  <div class="idle-overlay" @click="$emit('dismiss')">
    <div class="screensaver-content">
      <div class="logo-container">
        <h1 class="logo-text"><span class="text-gradient">Juan</span>Charge</h1>
        <div class="logo-icon pulse">
          <Zap :size="100" />
        </div>
      </div>
      
      <div class="message-container">
        <p class="tagline">Smart. Green. Reliable.</p>
        <div class="tap-to-start">
          <span class="tap-text">Tap anywhere to start</span>
          <div class="tap-indicator"></div>
        </div>
      </div>
    </div>
    
    <!-- Background animations -->
    <div class="bg-elements">
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>
      <div class="orb orb-3"></div>
    </div>
  </div>
</template>

<style scoped>
.idle-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(15, 23, 42, 0.4); /* Semi-transparent dark blue */
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  overflow: hidden;
}

.screensaver-content {
  text-align: center;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 60px;
}

.logo-text {
  font-size: 5rem;
  font-weight: 800;
  letter-spacing: -3px;
  margin-bottom: 20px;
}

.logo-icon {
  color: var(--secondary);
  filter: drop-shadow(0 0 20px var(--secondary-light));
  margin: 0 auto;
}

.tagline {
  font-size: 1.5rem;
  color: var(--text-muted);
  letter-spacing: 5px;
  text-transform: uppercase;
  margin-bottom: 40px;
}

.tap-to-start {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
}

.tap-text {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--primary);
  opacity: 0.8;
  animation: blink 2s infinite;
}

.tap-indicator {
  width: 40px;
  height: 40px;
  border: 2px solid var(--primary);
  border-radius: 50%;
  position: relative;
}

.tap-indicator::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 10px;
  height: 10px;
  background: var(--primary);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  animation: ripple 2s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.8; }
}

@keyframes ripple {
  0% { width: 0; height: 0; opacity: 1; }
  100% { width: 60px; height: 60px; opacity: 0; }
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.1); opacity: 0.8; }
}

.text-gradient {
  background: linear-gradient(135deg, #a7fbd1 0%, #4de8d8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 0 10px rgba(167, 251, 209, 0.3));
}

.pulse {
  animation: pulse 3s infinite ease-in-out;
}

/* Background elements */
.bg-elements {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  pointer-events: none;
}

.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.3;
}

.orb-1 {
  width: 600px;
  height: 600px;
  background: var(--primary);
  top: -200px;
  left: -200px;
  animation: float 25s infinite ease-in-out;
}

.orb-2 {
  width: 500px;
  height: 500px;
  background: var(--secondary);
  bottom: -150px;
  right: -150px;
  animation: float 30s infinite ease-in-out reverse;
}

.orb-3 {
  width: 400px;
  height: 400px;
  background: #11998e;
  top: 40%;
  right: 10%;
  animation: float 20s infinite ease-in-out 5s;
}

@keyframes float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(100px, 50px) scale(1.2); }
  66% { transform: translate(-50px, 100px) scale(0.9); }
}

@media (max-height: 480px) {
  .logo-text { font-size: 3rem; }
  .logo-icon svg { width: 60px; height: 60px; }
  .tagline { font-size: 1rem; margin-bottom: 20px; }
  .screensaver-content { gap: 30px; }
}
</style>
