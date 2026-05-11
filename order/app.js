const toggleMic = async () => {
    // 1. Check for browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Prohlížeč nepodporuje Web Speech API. Použijte Chrome.");
        return;
    }

    if (isListening.value) {
        // Force stop
        artyom.fatality().then(() => {
            isListening.value = false;
        });
    } else {
        try {
            // 2. Clear previous instances
            await artyom.fatality(); 

            // 3. Re-initialize with User Gesture
            artyom.initialize({
                lang: "cs-CZ",
                continuous: false, // Set to false for cleaner recognition
                listen: true,
                debug: true,
                speed: 1
            }).then(() => {
                isListening.value = true;
                // Voice feedback to confirm synthesis is also working
                artyom.say("Poslouchám"); 
                console.log("Mic active");
            }).catch(err => {
                console.error("Initialization error:", err);
                if (err.code === "not-allowed") {
                    alert("Povolte prosím mikrofon v nastavení prohlížeče.");
                }
            });
        } catch (e) {
            console.log("Fatal error restarting engine", e);
        }
    }
};
