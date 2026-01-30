/**
 * GPIO Relay Controller for JuanCharge Kiosk
 * 
 * Platform-aware relay control with automatic detection:
 * - Raspberry Pi: Uses real GPIO control via 'onoff' package
 * - Windows/Mac/Other: Uses mock mode with console logging
 * 
 * Features:
 * - 3 independent relay channels (GPIO pins 17, 27, 22)
 * - Timer-based auto-shutoff (1 point = 60 seconds)
 * - Status tracking for all active relays
 */

import os from 'os';

// GPIO pin configuration
const RELAY_PINS = {
  1: 17,  // Port 1 -> GPIO 17
  2: 27,  // Port 2 -> GPIO 27
  3: 22   // Port 3 -> GPIO 22
};

// Detect platform
const isRaspberryPi = () => {
  const platform = os.platform();
  const arch = os.arch();
  
  // Check if running on Linux ARM (typical for Raspberry Pi)
  if (platform === 'linux' && (arch === 'arm' || arch === 'arm64')) {
    return true;
  }
  
  return false;
};

const USE_MOCK = !isRaspberryPi();

// Relay state tracking
const relayStates = {
  1: { active: false, timer: null, remainingSeconds: 0, totalSeconds: 0, startTime: null },
  2: { active: false, timer: null, remainingSeconds: 0, totalSeconds: 0, startTime: null },
  3: { active: false, timer: null, remainingSeconds: 0, totalSeconds: 0, startTime: null }
};

// Event callback for status changes
let statusChangeCallback = null;

// Set callback for status change events
export const setStatusChangeCallback = (callback) => {
  statusChangeCallback = callback;
  console.log('[RELAY] Status change callback registered');
};

// Emit status change event
const emitStatusChange = () => {
  if (statusChangeCallback) {
    const statuses = getAllRelayStatuses();
    statusChangeCallback(statuses);
  }
};

let Gpio = null;
let relayGpios = {};

// Initialize GPIO (only on Raspberry Pi)
const initializeGpio = async () => {
  if (USE_MOCK) {
    console.log('[RELAY MOCK] Platform:', os.platform(), '- Using mock relay controller');
    return true;
  }
  
  try {
    // Dynamically import onoff (will fail on non-Linux platforms)
    const onoffModule = await import('onoff');
    Gpio = onoffModule.Gpio;
    
    // Initialize GPIO pins for all relays
    for (const [port, pin] of Object.entries(RELAY_PINS)) {
      relayGpios[port] = new Gpio(pin, 'out');
      // Ensure relay starts in OFF state
      relayGpios[port].writeSync(0);
      console.log(`[RELAY] Initialized Port ${port} on GPIO ${pin}`);
    }
    
    return true;
  } catch (error) {
    console.error('[RELAY] Failed to initialize GPIO:', error.message);
    console.log('[RELAY] Falling back to mock mode');
    return false;
  }
};

/**
 * Activate a relay for a specified duration
 * @param {number} port - Port number (1, 2, or 3)
 * @param {number} durationSeconds - Duration in seconds
 * @returns {Promise<Object>} Result object with success status
 */
export const activateRelay = async (port, durationSeconds) => {
  if (!RELAY_PINS[port]) {
    return { success: false, error: `Invalid port: ${port}` };
  }
  
  // Check if port is already active
  if (relayStates[port].active) {
    return { success: false, error: `Port ${port} is already active` };
  }
  
  const endTime = new Date(Date.now() + durationSeconds * 1000);
  
  if (USE_MOCK) {
    console.log(`[RELAY MOCK] Activating Port ${port} for ${durationSeconds} seconds`);
    console.log(`[RELAY MOCK] Port ${port} will auto-shutoff at: ${endTime.toISOString()}`);
  } else {
    try {
      // Turn relay ON (write HIGH to GPIO)
      relayGpios[port].writeSync(1);
      console.log(`[RELAY] Port ${port} activated for ${durationSeconds} seconds`);
    } catch (error) {
      console.error(`[RELAY] Failed to activate Port ${port}:`, error.message);
      return { success: false, error: error.message };
    }
  }
  
  // Update state
  relayStates[port].active = true;
  relayStates[port].remainingSeconds = durationSeconds;
  relayStates[port].totalSeconds = durationSeconds;
  relayStates[port].startTime = new Date().toISOString();
  
  // Start countdown timer (updates every second)
  const countdownInterval = setInterval(() => {
    if (relayStates[port].remainingSeconds > 0) {
      relayStates[port].remainingSeconds--;
    }
  }, 1000);
  
  // Set auto-shutoff timer
  const shutoffTimer = setTimeout(() => {
    clearInterval(countdownInterval);
    deactivateRelay(port, true);
  }, durationSeconds * 1000);
  
  relayStates[port].timer = { shutoff: shutoffTimer, countdown: countdownInterval };
  
  // Emit status change event
  emitStatusChange();
  
  return {
    success: true,
    port,
    durationSeconds,
    endTime: endTime.toISOString()
  };
};

/**
 * Deactivate a relay
 * @param {number} port - Port number (1, 2, or 3)
 * @param {boolean} isAutoShutoff - Whether this is an automatic shutoff
 * @returns {Object} Result object with success status
 */
export const deactivateRelay = (port, isAutoShutoff = false) => {
  if (!RELAY_PINS[port]) {
    return { success: false, error: `Invalid port: ${port}` };
  }
  
  if (!relayStates[port].active) {
    return { success: false, error: `Port ${port} is not active` };
  }
  
  // Clear timers
  if (relayStates[port].timer) {
    clearTimeout(relayStates[port].timer.shutoff);
    clearInterval(relayStates[port].timer.countdown);
  }
  
  if (USE_MOCK) {
    const reason = isAutoShutoff ? 'auto-shutoff' : 'manual deactivation';
    console.log(`[RELAY MOCK] Port ${port} deactivated (${reason})`);
  } else {
    try {
      // Turn relay OFF (write LOW to GPIO)
      relayGpios[port].writeSync(0);
      const reason = isAutoShutoff ? 'auto-shutoff' : 'manual deactivation';
      console.log(`[RELAY] Port ${port} deactivated (${reason})`);
    } catch (error) {
      console.error(`[RELAY] Failed to deactivate Port ${port}:`, error.message);
      return { success: false, error: error.message };
    }
  }
  
  // Reset state
  relayStates[port].active = false;
  relayStates[port].timer = null;
  relayStates[port].remainingSeconds = 0;
  relayStates[port].totalSeconds = 0;
  relayStates[port].startTime = null;
  
  // Emit status change event
  emitStatusChange();
  
  return { success: true, port };
};

/**
 * Get status of a specific relay
 * @param {number} port - Port number (1, 2, or 3)
 * @returns {Object} Status object
 */
export const getRelayStatus = (port) => {
  if (!RELAY_PINS[port]) {
    return { error: `Invalid port: ${port}` };
  }
  
  return {
    port,
    active: relayStates[port].active,
    remainingSeconds: relayStates[port].remainingSeconds,
    totalSeconds: relayStates[port].totalSeconds,
    startTime: relayStates[port].startTime
  };
};

/**
 * Get status of all relays
 * @returns {Array} Array of status objects for all ports
 */
export const getAllRelayStatuses = () => {
  return [
    getRelayStatus(1),
    getRelayStatus(2),
    getRelayStatus(3)
  ];
};

/**
 * Cleanup function - deactivate all relays and unexport GPIO
 */
export const cleanup = () => {
  console.log('[RELAY] Cleaning up...');
  
  // Deactivate all active relays
  for (const port of [1, 2, 3]) {
    if (relayStates[port].active) {
      deactivateRelay(port);
    }
  }
  
  // Unexport GPIO pins (only on Raspberry Pi)
  if (!USE_MOCK && Gpio) {
    for (const [port, gpio] of Object.entries(relayGpios)) {
      try {
        gpio.unexport();
        console.log(`[RELAY] Unexported GPIO for Port ${port}`);
      } catch (error) {
        console.error(`[RELAY] Error unexporting Port ${port}:`, error.message);
      }
    }
  }
};

// Initialize on module load
initializeGpio();

// Export initialization function for explicit initialization if needed
export { initializeGpio };
