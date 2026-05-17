const { createApp, ref, onMounted, onBeforeUnmount } = Vue;

createApp({
  setup() {
    const currentTab = ref('grill');
    
    // Globally recognized high-end traditional BBQ recipes profiles
    const basePresets = [
      { name: 'Texas Steak', icon: '🥩', duration: 600, flipInterval: 300, isCustom: false },
      { name: 'Hermelin', icon: '🧀', duration: 300, flipInterval: 150, isCustom: false },
      { name: 'Ribs', icon: '🐂', duration: 600, flipInterval: 300, isCustom: false },
      { name: 'Vegetables', icon: '🌽', duration: 600, flipInterval: 0, isCustom: false }
    ];

    const foodPresets = ref([]);
    const activeTimers = ref([]);
    const wakeLockActive = ref(false);
    let wakeLockInstance = null;
    let timerInterval = null;

    // Requested 32-icon culinary selection matrix
    const iconLibrary = [
      '🥩', '🍖', '🍔', '🥓', '🍗', '🌭', '🍢', '🐟', 
      '🦐', '🦞', '🦪', '🌽', '🍄', '🧅', '🌶️', '🥔', 
      '🍍', '🧀', '🍞', '🧂', '🐂', '🐖', '🐓', '🐑', 
      '🥢', '⚔️', '🔥', '🍋', '🌿', '🍅', '🥑', '🇬🇷'
    ];

    // Reactive Editor state bindings
    const newRecipe = ref({
      name: '',
      icon: '🥩',
      minutes: 10,
      flipMinutes: 2
    });

    // Parse and reconstruct local storage data caches
    const initPresetsList = () => {
      const stored = localStorage.getItem('custom_grill_recipes');
      if (stored) {
        try {
          const parsedCustoms = JSON.parse(stored);
          foodPresets.value = [...basePresets, ...parsedCustoms];
        } catch(e) {
          foodPresets.value = [...basePresets];
        }
      } else {
        foodPresets.value = [...basePresets];
      }
    };

    const saveCustomRecipe = () => {
      if (!newRecipe.value.name.trim()) {
        alert('Please assign a valid recipe name!');
        return;
      }
      
      const convertedRecipe = {
        name: newRecipe.value.name,
        icon: newRecipe.value.icon,
        duration: (newRecipe.value.minutes || 1) * 60,
        flipInterval: (newRecipe.value.flipMinutes || 1) * 60,
        isCustom: true
      };

      const stored = localStorage.getItem('custom_grill_recipes');
      let currentCustoms = [];
      if (stored) {
        try { currentCustoms = JSON.parse(stored); } catch(e) {}
      }
      
      currentCustoms.push(convertedRecipe);
      localStorage.setItem('custom_grill_recipes', JSON.stringify(currentCustoms));
      
      initPresetsList();
      
      // Clear inputs
      newRecipe.value.name = '';
      newRecipe.value.icon = '🥩';
      newRecipe.value.minutes = 10;
      newRecipe.value.flipMinutes = 2;
      
      currentTab.value = 'grill';
    };

    const deletePreset = (index) => {
      const targetedItem = foodPresets.value[index];
      if (!targetedItem.isCustom) return;

      const stored = localStorage.getItem('custom_grill_recipes');
      if (stored) {
        try {
          let currentCustoms = JSON.parse(stored);
          currentCustoms = currentCustoms.filter(item => item.name !== targetedItem.name);
          localStorage.setItem('custom_grill_recipes', JSON.stringify(currentCustoms));
          initPresetsList();
        } catch(e) {}
      }
    };

    // Screen Wake Lock API Management
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          wakeLockInstance = await navigator.wakeLock.request('screen');
          wakeLockActive.value = true;
          wakeLockInstance.addEventListener('release', () => {
            wakeLockActive.value = false;
          });
        } catch (err) {
          console.warn(`Wake Lock request rejected: ${err.message}`);
        }
      }
    };

    // Single-Action Initialization with Background-Safe Epoches
    const addToGrill = (food) => {
      if (!wakeLockActive.value) requestWakeLock();

      const now = Date.now();
      activeTimers.value.push({
        id: Date.now() + Math.random(),
        name: food.name,
        icon: food.icon,
        startTime: now,
        endTime: now + (food.duration * 1000), // Epoch milestone calculation
        total: food.duration,
        remaining: food.duration,
        flipInterval: food.flipInterval,
        lastFlipAlerted: 0 // Tracking steps for intervals
      });
    };

    const removeTimer = (id) => {
      activeTimers.value = activeTimers.value.filter(t => t.id !== id);
    };

    // Native Low-Latency Synthesizer (Zero asset dependancies)
    const playAlertSound = (isDone = false) => {
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(isDone ? 987.77 : 659.25, audioCtx.currentTime); // High notes
        gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime);

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + (isDone ? 0.6 : 0.25));
      } catch (e) {}
    };

    // Epoch Delta Core Engine: Recalculates time from the system clock
    // This allows accurate updates if the browser throttled/paused in the background
    const startGlobalTicker = () => {
      timerInterval = setInterval(() => {
        const currentEpoch = Date.now();
        
        activeTimers.value.forEach(timer => {
          const msRemaining = timer.endTime - currentEpoch;
          
          if (msRemaining > 0) {
            const newRemaining = Math.ceil(msRemaining / 1000);
            const totalElapsedSeconds = timer.total - newRemaining;
            
            // Check if we hit a flip interval step while away
            const flipStep = Math.floor(totalElapsedSeconds / timer.flipInterval);
            if (flipStep > timer.lastFlipAlerted && totalElapsedSeconds > 0) {
              playAlertSound(false);
              timer.lastFlipAlerted = flipStep;
            }
            
            timer.remaining = newRemaining;
          } else {
            if (timer.remaining > 0) { // Transitioning to 0 right now
              timer.remaining = 0;
              playAlertSound(true);
              setTimeout(() => playAlertSound(true), 250);
            }
          }
        });
      }, 1000);
    };

    const formatMinutes = (seconds) => `${Math.round(seconds / 60)}m`;
    const formatSeconds = (totalSeconds) => {
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const getProgress = (timer) => {
      if (timer.remaining <= 0) return 100;
      return ((timer.total - timer.remaining) / timer.total) * 100;
    };

    // Visibility Listener checks for returning to app foreground
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        await requestWakeLock();
      }
    };

    onMounted(() => {
      initPresetsList();
      startGlobalTicker();
      requestWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      // Hook web notifications permission if supported
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    });

    onBeforeUnmount(() => {
      clearInterval(timerInterval);
      if (wakeLockInstance) wakeLockInstance.release();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    });

    return {
      currentTab,
      foodPresets,
      activeTimers,
      wakeLockActive,
      iconLibrary,
      newRecipe,
      addToGrill,
      removeTimer,
      saveCustomRecipe,
      deletePreset,
      formatMinutes,
      formatSeconds,
      getProgress
    };
  }
}).mount('#app');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error(err));
  });
}