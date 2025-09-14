// --- GLOBAL FUNCTIONS FOR PYTHON TO CALL ---
function updateDownloadProgress(message, current, total) {
    const progressBar = document.getElementById('progress-bar');
    const statusText = document.getElementById('download-status');
    if (progressBar && statusText) {
        const percentage = total > 0 ? Math.min(100, (current / total) * 100) : 0;
        progressBar.style.width = `${percentage}%`;
        statusText.textContent = `${message}`;
    }
}
function downloadComplete() {
    document.getElementById('download-status').textContent = "All models downloaded successfully!";
    document.getElementById('download-container').classList.add('hidden');
    document.getElementById('onboarding-container').classList.remove('hidden');
}

// --- MAIN SCRIPT ---
window.addEventListener('pywebviewready', () => {
    let state = {
        character: { inventory: [] },
        world: { lore: {}, npcs: [] },
        storyLog: [],
        isLoading: false,
    };
    const DOMElements = {
        downloadContainer: document.getElementById('download-container'),
        startDownloadButton: document.getElementById('start-download-button'),
        onboardingContainer: document.getElementById('onboarding-container'),
        gameContainer: document.getElementById('game-container'),
        startButton: document.getElementById('start-button'),
        modelSelect: document.getElementById('model-select'),
        imageModelSelect: document.getElementById('image-model-select'),
        charName: document.getElementById('char-name'),
        charPortraitContainer: document.getElementById('char-portrait-container'),
        charStatus: document.getElementById('char-status'),
        charInventory: document.getElementById('char-inventory'),
        charBackstory: document.getElementById('char-backstory'),
        storyLog: document.getElementById('story-log'),
        playerInput: document.getElementById('player-input'),
        sendButton: document.getElementById('send-button'),
        worldLore: document.getElementById('world-lore'),
        worldNpcs: document.getElementById('world-npcs'),
        loadingOverlay: document.getElementById('loading-overlay'),
        loadingText: document.getElementById('loading-text'),
    };

    function updateLoadingState(isLoading, message = "...") {
        state.isLoading = isLoading;
        DOMElements.loadingText.textContent = message;
        DOMElements.playerInput.disabled = isLoading;
        DOMElements.sendButton.disabled = isLoading;
        DOMElements.sendButton.textContent = isLoading ? '...' : 'Send';
    }

    function addStoryEntry({ type, text, imageUrl }) {
        if (!text || !text.trim()) return;
        const entryDiv = document.createElement('div');
        entryDiv.className = `story-entry ${type}`;
        if (imageUrl) {
            const img = document.createElement('img');
            img.src = imageUrl;
            img.alt = "Scene";
            entryDiv.appendChild(img);
        }
        const p = document.createElement('p');
        p.innerHTML = text.trim().replace(/\n/g, '<br>');
        entryDiv.appendChild(p);
        DOMElements.storyLog.appendChild(entryDiv);
        DOMElements.storyLog.scrollTop = DOMElements.storyLog.scrollHeight;
    }

    function renderAllPanels() {
        DOMElements.charName.textContent = state.character.name || '';
        DOMElements.charStatus.textContent = `"${state.character.status || ''}"`;
        DOMElements.charBackstory.textContent = state.character.backstory || '';
        if (state.character.imageUrl) {
            DOMElements.charPortraitContainer.innerHTML = `<img src="${state.character.imageUrl}" alt="Character Portrait">`;
        }
        DOMElements.charInventory.innerHTML = state.character.inventory.length ? state.character.inventory.map(item => `<li><strong>${item.name}</strong>: ${item.description}</li>`).join('') : '<li>Empty</li>';
        DOMElements.worldLore.innerHTML = Object.keys(state.world.lore).length ? Object.entries(state.world.lore).map(([key, value]) => `<div class="lore-item"><strong>${key}</strong>: ${value}</div>`).join('') : '';
        DOMElements.worldNpcs.innerHTML = state.world.npcs.length ? state.world.npcs.map(npc => `<div class="npc-card"><strong>${npc.name}</strong>: ${npc.description}</div>`).join('') : '';
    }

    async function handlePlayerAction(action) {
        updateLoadingState(true, "Generating response...");
        addStoryEntry({ type: 'player', text: action });
        const recentHistory = state.storyLog.slice(-6).map(entry => `${entry.type === 'player' ? 'Player' : 'Story'}: ${entry.text}`).join('\n');
        const prompt = `EXAMPLE:\nHistory:\nPlayer: I search for clues.\nStory: You find a locket. [update-status]You feel hopeful.[/update-status][img-prompt]A silver locket.[/img-prompt]\n\nCURRENT SITUATION:\nHistory:\n${recentHistory}\n\nPlayer: ${action}\nStory:`;
        try {
            const data = await window.pywebview.api.generate_text(prompt);
            if (data.error) throw new Error(data.error);
            let narrativeText = data.response;
            let sceneImageUrl = null;
            const tagRegex = /\[(update-status|add-item|create-npc|update-lore|img-prompt|char-img-prompt)\](.*?)\[\/\1\]/gs;
            let match;
            while ((match = tagRegex.exec(data.response)) !== null) {
                const [fullTag, tagName, content] = match;
                narrativeText = narrativeText.replace(fullTag, '').trim();
                switch (tagName) {
                    case 'update-status': state.character.status = content; break;
                    case 'add-item':
                        const [name, desc] = content.split('|');
                        state.character.inventory.push({ name: name.trim(), description: (desc || '').trim() });
                        break;
                    case 'create-npc':
                        try { const npc = JSON.parse(content); if (npc.id) state.world.npcs.push(npc); } catch {}
                        break;
                    case 'update-lore':
                        const [key, value] = content.split('|');
                        state.world.lore[key.trim()] = value.trim();
                        break;
                    case 'img-prompt':
                        const sceneImgData = await window.pywebview.api.generate_image(content, 'scene');
                        if (sceneImgData.image_data_url) sceneImageUrl = sceneImgData.image_data_url;
                        break;
                    case 'char-img-prompt':
                        const portraitData = await window.pywebview.api.generate_image(content, 'portrait');
                        if (portraitData.image_data_url) state.character.imageUrl = portraitData.image_data_url;
                        break;
                }
            }
            addStoryEntry({ type: 'narrative', text: narrativeText, imageUrl: sceneImageUrl });
        } catch (error) {
            console.error("Error:", error);
            addStoryEntry({ type: 'narrative', text: "An error occurred. Check the Python terminal." });
        } finally {
            updateLoadingState(false);
            renderAllPanels();
        }
    }

    DOMElements.startDownloadButton.addEventListener('click', () => {
        DOMElements.startDownloadButton.textContent = 'Downloading... Please Wait';
        DOMElements.startDownloadButton.disabled = true;
        window.pywebview.api.download_all_models();
    });

    DOMElements.startButton.addEventListener('click', async () => {
        DOMElements.startButton.textContent = 'Loading Models...';
        DOMElements.startButton.disabled = true;
        DOMElements.loadingOverlay.classList.remove('hidden');
        const selectedTextModel = DOMElements.modelSelect.value;
        const selectedImageModel = DOMElements.imageModelSelect.value;
        try {
            const initResponse = await window.pywebview.api.initialize_models(selectedTextModel, selectedImageModel);
            if (initResponse.error) throw new Error(initResponse.error);
        } catch (e) {
            alert(`Could not load AI models: ${e.message}.`);
            DOMElements.startButton.textContent = 'Begin Adventure';
            DOMElements.startButton.disabled = false;
            DOMElements.loadingOverlay.classList.add('hidden');
            return;
        }
        const charName = document.getElementById('onboarding-char-name').value;
        const charBackstory = document.getElementById('onboarding-char-backstory').value;
        state.character = { name: charName, backstory: charBackstory, status: "Ready", inventory: [] };
        state.world.lore = { "Core Concept": document.getElementById('world-concept').value };
        try {
            const portraitPrompt = `cinematic portrait of ${state.character.name}, ${state.character.backstory}`;
            const imgData = await window.pywebview.api.generate_image(portraitPrompt, 'portrait');
            state.character.imageUrl = imgData.image_data_url;
        } catch (e) { console.error("Failed to generate character portrait:", e); }
        DOMElements.onboardingContainer.classList.add('hidden');
        DOMElements.gameContainer.classList.remove('hidden');
        DOMElements.loadingOverlay.classList.add('hidden');
        renderAllPanels();
        const openingPrompt = document.getElementById('opening-prompt').value;
        handlePlayerAction(openingPrompt);
    });

    DOMElements.sendButton.addEventListener('click', () => {
        const input = DOMElements.playerInput.value;
        if (input.trim() && !state.isLoading) {
            handlePlayerAction(input);
            DOMElements.playerInput.value = '';
        }
    });

    DOMElements.playerInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); DOMElements.sendButton.click(); }
    });
});