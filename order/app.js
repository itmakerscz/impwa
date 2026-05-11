const toggleMic = async () => {
    // 1. Check for basic API support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Hlasové ovládání není v tomto prohlížeči podporováno. Zkuste prosím Google Chrome.");
        return;
    }

    try {
        // 2. Check current Permission Status (Standard in 2026)
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' });

        if (permissionStatus.state === 'denied') {
            alert("Přístup k mikrofonu je zablokován. Povolte jej prosím v nastavení adresního řádku (ikona zámku).");
            return;
        }

        // 3. Handle Active State
        if (isListening.value) {
            await artyom.fatality();
            isListening.value = false;
        } else {
            // 4. Trigger Initialization (This forces the browser popup)
            artyom.initialize({
                lang: "cs-CZ",
                continuous: false,
                listen: true,
                debug: true,
                speed: 1
            }).then(() => {
                isListening.value = true;
                artyom.say("Poslouchám"); 
                console.log("Hlasové ovládání aktivní.");
            }).catch(err => {
                console.error("Chyba při startu:", err);
                // This catch handles when the user clicks 'Block' on the popup
                alert("Nepodařilo se spustit mikrofon. Ujistěte se, že jste klikli na 'Povolit'.");
            });
        }
    } catch (error) {
        console.error("Permissions API error:", error);
        // Fallback for browsers that don't support permissions.query fully
        startListeningFallback();
    }
};
    
