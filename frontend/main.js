// --- STATE MANAGEMENT ---
let gameState = {
    character: {},
    world: {},
    storyLog: [],
    isLoading: true,
};

// --- DOM ELEMENT SELECTORS ---
const UIElements = {
    // Panels
    characterPanel: document.getElementById('character-panel'),
    narrativePanel: document.getElementById('narrative-panel'),
    contextPanel: document.getElementById('context-panel'),
    // Character
    charName: document.getElementById('char-name'),
    charPortraitContainer: document.getElementById('char-portrait-container'),
    charStatus: document.getElementById('char-status'),
    charInventory: document.getElementById('char-inventory'),
    charBackstory: document.getElementById('char-backstory'),
    // Narrative
    storyLog: document.getElementById('story-log'),
    playerInput: document.getElementById('player-input'),
    sendButton: document.getElementById('send-button'),
    // Context
    worldLore: document.getElementById('world-lore'),
    worldNpcs: document.getElementById('world-npcs'),
    // Loading
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text'),
};

// --- API COMMUNICATION ---
async function callApi(endpoint, body) {
    const response = await fetch(`http://127.0.0.1:5000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
    }
    return response.json();
}

// --- RENDERING LOGIC ---
function render() {
    // Character Panel
    UIElements.charName.textContent = gameState.character.name || '...';
    UIElements.charStatus.textContent = `"${gameState.character.status}"` || '"..."';
    UIElements.charBackstory.textContent = gameState.character.backstory || '...';
    
    if (gameState.character.imageUrl) {
        UIElements.charPortraitContainer.innerHTML = `<img src="${gameState.character.imageUrl}" alt="Character Portrait">`;
    }

    UIElements.charInventory.innerHTML = gameState.character.inventory.length
        ? gameState.character.inventory.map(item => `<li><strong>${item.name}</strong>: ${item.description}</li>`).join('')
        : '<li>Empty</li>';
    
    // Context Panel
    UIElements.worldLore.innerHTML = Object.keys(gameState.world.lore).length
        ? Object.entries(gameState.world.lore).map(([key, value]) => `<div class="lore-item"><strong>${key}</strong>: ${value}</div>`).join('')
        : '<p>No lore discovered.</p>';

    UIElements.worldNpcs.innerHTML = gameState.world.npcs.length
        ? gameState.world.npcs.map(npc => `<div class="npc-card"><strong>${npc.name}</strong>: ${npc.description}</div>`).join('')
        : '<p>No NPCs met.</p>';

    // Narrative Panel
    UIElements.storyLog.innerHTML = gameState.storyLog.map(entry => `
        <div class="story-entry ${entry.type}">
            ${entry.imageUrl ? `<img src="${entry.imageUrl}" alt="Scene">` : ''}
            <p>${entry.text}</p>
        </div>
    `).join('');
    UIElements.storyLog.scrollTop = UIElements.storyLog.scrollHeight;
    
    // Loading State
    UIElements.playerInput.disabled = gameState.isLoading;
    UIElements.sendButton.disabled = gameState.isLoading;
    if (gameState.isLoading) {
        UIElements.sendButton.textContent = '...';
    } else {
        UIElements.sendButton.textContent = 'Send';
    }
}

// --- APPLICATION LOGIC ---
async function parseAndApplyTags(rawResponse) {
    let narrativeText = rawResponse;
    const tagRegex = /\[(update-status|add-item|create-npc|update-lore)\](.*?)\[\/\1\]/g;
    
    let match;
    while ((match = tagRegex.exec(rawResponse)) !== null) {
        const [fullTag, tagName, content] = match;
        narrativeText = narrativeText.replace(fullTag, '').trim();

        switch (tagName) {
            case 'update-status':
                gameState.character.status = content;
                break;
            case 'add-item':
                const [name, description] = content.split('|');
                gameState.character.inventory.push({ name: name.trim(), description: (description || '').trim() });
                break;
            case 'create-npc':
                try {
                    const npc = JSON.parse(content);
                    gameState.world.npcs.push(npc);
                } catch {}
                break;
             case 'update-lore':
                const [key, value] = content.split('|');
                gameState.world.lore[key.trim()] = value.trim();
                break;
        }
    }
    return narrativeText;
}

async function handlePlayerAction(action) {
    gameState.isLoading = true;
    gameState.storyLog.push({ type: 'player', text: action });
    render();

    const prompt = `You are a master storyteller. Your response must be narrative text followed by state-change tags.
---
WORLD LORE: ${JSON.stringify(gameState.world.lore)}
CHARACTER: ${JSON.stringify(gameState.character)}
---
PLAYER ACTION: "${action}"
---
YOUR RESPONSE:`;

    try {
        const data = await callApi('/generate/text', { prompt });
        const narrativeText = await parseAndApplyTags(data.response);
        
        const imgPromptMatch = narrativeText.match(/\[img-prompt\](.*?)\[\/img-prompt\]/i);
        let finalNarrative = narrativeText.replace(/\[img-prompt\](.*?)\[\/img-prompt\]/i, '').trim();
        let imageUrl = null;

        if (imgPromptMatch?.[1]) {
            const imgData = await callApi('/generate/image', { prompt: imgPromptMatch[1] });
            imageUrl = imgData.image_data_url;
        }

        gameState.storyLog.push({ type: 'narrative', text: finalNarrative, imageUrl });

    } catch (error) {
        console.error("Error:", error);
        gameState.storyLog.push({ type: 'narrative', text: "Error connecting to the AI engine. Please ensure app.py is running." });
    } finally {
        gameState.isLoading = false;
        render();
    }
}

// --- ONBOARDING & INITIALIZATION ---
function showOnboarding() {
    UIElements.loadingOverlay.classList.remove('hidden');
    UIElements.loadingText.textContent = 'Welcome! Please set up your story.';
    UIElements.gameContainer.style.display = 'none';

    const onboardingDiv = document.createElement('div');
    onboardingDiv.className = 'onboarding-container';
    onboardingDiv.innerHTML = `
        <h2>Create Your Saga</h2>
        <label>World Concept</label>
        <textarea id="world-concept">A gritty cyberpunk city where mega-corporations rule from neon towers while life thrives in the shadowy streets below.</textarea>
        <label>Character Name</label>
        <input type="text" id="onboarding-char-name" value="Jax">
        <label>Character Backstory</label>
        <textarea id="onboarding-char-backstory">An ex-corporate netrunner, burned by their former employer, now surviving as a freelance data thief in the city's underbelly.</textarea>
        <label>Opening Scene</label>
        <textarea id="opening-prompt">Describe my character, Jax, patching into the network from a dimly lit noodle stand, hunting for their next score as acid rain streaks down the nearby alley.</textarea>
        <button id="start-button">Begin Adventure</button>
    `;
    document.body.appendChild(onboardingDiv);

    document.getElementById('start-button').addEventListener('click', () => {
        gameState.character = {
            name: document.getElementById('onboarding-char-name').value,
            backstory: document.getElementById('onboarding-char-backstory').value,
            status: "Ready for anything.",
            inventory: [{ name: "Datapad", description: "A cracked hacking device." }],
        };
        gameState.world.lore = { "Core Concept": document.getElementById('world-concept').value };
        const openingPrompt = document.getElementById('opening-prompt').value;
        
        onboardingDiv.remove();
        UIElements.gameContainer.style.display = 'grid';
        UIElements.loadingOverlay.classList.add('hidden');
        
        handlePlayerAction(openingPrompt);
    });
}

function initializeApp() {
    // Hide the loading overlay once the window and models are ready
    // We will assume models are ready after a few seconds for this version
    setTimeout(() => {
        if (text_model && image_pipeline) { // This check is conceptual, as JS can't see Python vars
             UIElements.loadingOverlay.classList.add('hidden');
        } else {
            UIElements.loadingText.textContent = "AI models failed to load. Please restart the application.";
        }
    }, 5000); // Give models time to load

    showOnboarding();
    
    // Setup event listeners
    UIElements.sendButton.addEventListener('click', () => {
        const input = UIElements.playerInput.value;
        if (input.trim()) {
            handlePlayerAction(input);
            UIElements.playerInput.value = '';
        }
    });

    UIElements.playerInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            UIElements.sendButton.click();
        }
    });
}

// Start the application
initializeApp();