const { createApp, ref, onMounted, onBeforeUnmount } = Vue;

createApp({
  setup() {
    // Standard recommended grill profiles (values in total seconds)
    const foodPresets = ref([
      { name: 'Ribeye/NY Strip (Medium Rare)', icon: '🥩', duration: 480, flipInterval: 120 },
      { name: 'Thick Burger Patties', icon: '🍔', duration: 540, flipInterval: 135 },
      { name: 'Chicken Breast', icon: '🍗', duration: 720, flipInterval: 180 },
      { name: 'Pork Chops', icon: '🥓', duration: 600, flipInterval: 150 },
      { name: 'Salmon Fillets', icon: '🐟', duration: 480, flipInterval: 240 },
      { name: 'Grill Veggies / Corn', icon: '🌽', duration: 600, flipInterval: 150 }
    ]);

    const activeTimers = ref([]);
    const wakeLockActive = ref(false);
    let wakeLockInstance = null;
    let timerInterval = null;

    // Wake Lock System Setup
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          wakeLockInstance = await navigator.wakeLock.request('screen');
          wakeLockActive.value = true;
          
          // Re-request if visibility state alters (app goes background/foreground)
          wakeLockInstance.addEventListener('release', () => {
            wakeLockActive.value = false;
          });
        } catch (err) {
          console.warn(`Wake Lock could not activate: ${err.message}`);
          wakeLockActive.value = false;
        }
      }
    };

    // One Button Addition Logic
    const addToGrill = (food) => {
      // Auto-initiate wake lock on user touch action interaction safely
      if (!wakeLockActive.value) {
        requestWakeLock();
      }

      activeTimers.value.push({
        id: Date.now() + Math.random(),
        name: food.name,
        icon: food.icon,
        total: food.duration,
        remaining: food.duration,
        flipInterval: food.flipInterval
      });
    };

    const removeTimer = (id) => {
      activeTimers.value = activeTimers.value.filter(t => t.id !== id);
    };

    // Audio Alert Engine using native Web Audio API (Offline friendly, no audio files needed)
    const playAlertSound = () => {
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
        gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.start();
        // Beep duration 0.3s
        oscillator.stop(audioCtx.currentTime + 0.3);
      } catch (e) {
        console.error("Audio block error:", e);
      }
    };

    // Core Processing Ticker loop
    const startGlobalTicker = () => {
      timerInterval = setInterval(() => {
        activeTimers.value.forEach(timer => {
          if (timer.remaining > 0) {
            timer.remaining--;
            
            // Flip recommendation alerts
            if (timer.remaining > 0 && (timer.total - timer.remaining) % timer.flipInterval === 0) {
              playAlertSound();
            }
            
            // Finished alarm
            if (timer.remaining === 0) {
              playAlertSound();
              // Repeat beep immediately for emphasis
              setTimeout(playAlertSound, 400);
            }
          }
        });
      }, 1000);
    };

    // UI Formatting Utilities
    const formatMinutes = (seconds) => {
      return `${Math.round(seconds / 60)} min`;
    };

    const formatSeconds = (totalSeconds) => {
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const getProgress = (timer) => {
      return ((timer.total - timer.remaining) / timer.total) * 100;
    };

    // Visibility Listener configuration to maintain wake status
    const handleVisibilityChange = async () => {
      if (wakeLockInstance !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
      }
    };

    onMounted(() => {
      startGlobalTicker();
      requestWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    });

    onBeforeUnmount(() => {
      clearInterval(timerInterval);
      if (wakeLockInstance) wakeLockInstance.release();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    });

    return {
      foodPresets,
      activeTimers,
      wakeLockActive,
      addToGrill,
      removeTimer,
      formatMinutes,
      formatSeconds,
      getProgress
    };
  }
}).mount('#app');

// Register Service Worker for true PWA Offline Support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker Registered Successfully!'))
      .catch(err => console.log('Service Worker Registration Failed: ', err));
  });
}