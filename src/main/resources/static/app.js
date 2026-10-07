const HOST = window.location.origin;

const API_URL = `${HOST}/api`;
const AUTH_URL = `${HOST}/auth`;
const WS_URL = `${HOST}/ws`;

let stompClient = null;
let currentUser = null;
let authHeader = null;
let currentGameId = null;
let selectedShipType = null;
let isRegisterMode = false;
let pendingPlacement = null; // Stores { x, y, type, orientation }
let lastKnownState = null;
let gameSub = null;  // Stores the game state subscription
let errorSub = null; // Stores the error subscription
let lastSunkCount = 0;
let lastHitCountOpponent = 0;
let lastMissCountOpponent = 0;
let lastHitCountSelf = 0;
let lastMissCountSelf = 0;
let lastTurnPlayer = null;
let bannerTimeout = null;

// ================= SOUND MANAGER (WEB AUDIO API SYNTHESIS) =================
const SoundFX = {
    ctx: null,
    bgmOsc1: null,
    bgmOsc2: null,
    bgmGain: null,
    bgmInterval: null,
    isMuted: false,

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    toggleMute() {
        this.isMuted = !this.isMuted;
        const btn = document.getElementById('sound-toggle-btn');
        if (btn) {
            if (this.isMuted) {
                btn.innerText = "🔇 Audio: OFF";
                btn.classList.add('muted');
                this.stopBGM();
            } else {
                btn.innerText = "🔊 Audio: ON";
                btn.classList.remove('muted');
                this.startBGM();
            }
        }
    },

    // Background Suspense Atmosphere (Sub-bass drone + subtle sonar pulses)
    startBGM() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx || this.bgmOsc1) return;

        try {
            // Master low drone gain (rất nhỏ để không lấn át tiếng súng)
            this.bgmGain = this.ctx.createGain();
            this.bgmGain.gain.setValueAtTime(0.045, this.ctx.currentTime);
            this.bgmGain.connect(this.ctx.destination);

            // Drone 1: 55Hz (Sub-bass A1)
            this.bgmOsc1 = this.ctx.createOscillator();
            this.bgmOsc1.type = 'sawtooth';
            this.bgmOsc1.frequency.setValueAtTime(55, this.ctx.currentTime);

            // Drone 2: 58Hz (Binaural beating for tension)
            this.bgmOsc2 = this.ctx.createOscillator();
            this.bgmOsc2.type = 'sine';
            this.bgmOsc2.frequency.setValueAtTime(58.5, this.ctx.currentTime);

            // Low-pass filter to make it a deep dark rumble
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(140, this.ctx.currentTime);

            this.bgmOsc1.connect(filter);
            this.bgmOsc2.connect(filter);
            filter.connect(this.bgmGain);

            this.bgmOsc1.start();
            this.bgmOsc2.start();

            // Heartbeat/Sonar Ping interval every 4s
            this.bgmInterval = setInterval(() => {
                if (!this.isMuted && currentGameId) {
                    this.playSonarPing();
                }
            }, 4000);
        } catch (e) {
            console.warn("BGM start failed", e);
        }
    },

    stopBGM() {
        if (this.bgmInterval) {
            clearInterval(this.bgmInterval);
            this.bgmInterval = null;
        }
        if (this.bgmOsc1) {
            try {
                this.bgmOsc1.stop();
                this.bgmOsc1.disconnect();
            } catch (_) {}
            this.bgmOsc1 = null;
        }
        if (this.bgmOsc2) {
            try {
                this.bgmOsc2.stop();
                this.bgmOsc2.disconnect();
            } catch (_) {}
            this.bgmOsc2 = null;
        }
    },

    playSonarPing() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(840, now);
        osc.frequency.exponentialRampToValueAtTime(830, now + 1.2);
        gain.gain.setValueAtTime(0.02, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 1.2);
    },

    // 1. Tiếng súng pháo nổ giòn giã (Heavy Cannon Shot)
    playCannon() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // Low boom oscillator
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.35);

        oscGain.gain.setValueAtTime(0.4, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(oscGain);
        oscGain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);

        // Cannon Blast Noise
        const bufferSize = this.ctx.sampleRate * 0.4;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(60, now + 0.4);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.5, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        noise.start(now);
    },

    // 2. Tiếng đạn nổ bắn trúng mục tiêu (Explosive Hit Metal Impact)
    playHit() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // Sub blast
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.5);

        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.5);

        // High metallic shrapnel
        const oscHigh = this.ctx.createOscillator();
        const highGain = this.ctx.createGain();
        oscHigh.type = 'square';
        oscHigh.frequency.setValueAtTime(950, now);
        oscHigh.frequency.exponentialRampToValueAtTime(220, now + 0.25);
        highGain.gain.setValueAtTime(0.2, now);
        highGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        oscHigh.connect(highGain);
        highGain.connect(this.ctx.destination);
        oscHigh.start(now);
        oscHigh.stop(now + 0.25);
    },

    // 3. Tiếng bắn trượt (Water Splash / Miss)
    playMiss() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        const bufferSize = this.ctx.sampleRate * 0.35;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1400, now);
        filter.frequency.exponentialRampToValueAtTime(200, now + 0.35);
        filter.Q.value = 3.0;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(now);
    },

    // 4. Tiếng tàu chìm (Ship Sunk - Deep Alarm & Heavy Rupture)
    playShipSunk() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // Heavy catastrophic explosion
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 1.2);

        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 1.2);

        // Sinking Siren Alert (two pulses)
        [0.1, 0.5, 0.9].forEach(delay => {
            const siren = this.ctx.createOscillator();
            const sGain = this.ctx.createGain();
            siren.type = 'sawtooth';
            siren.frequency.setValueAtTime(440, now + delay);
            siren.frequency.linearRampToValueAtTime(220, now + delay + 0.3);
            sGain.gain.setValueAtTime(0.25, now + delay);
            sGain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.3);
            siren.connect(sGain);
            sGain.connect(this.ctx.destination);
            siren.start(now + delay);
            siren.stop(now + delay + 0.3);
        });
    },

    // 5. Tiếng chiến thắng (Victory Fanfare)
    playWin() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99]; // C - E - G - C - E - G
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const startTime = now + idx * 0.15;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, startTime);
            gain.gain.setValueAtTime(0.35, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + 0.6);
        });
    },

    // 6. Tiếng thất bại (Defeat Power-Down)
    playLose() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 1.8);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 1.8);
    }
};

function toggleAudio() {
    SoundFX.toggleMute();
}

// ================= INITIALIZATION =================
// Run this when the script loads to check for existing session
document.addEventListener("DOMContentLoaded", () => {
    // Unlock AudioContext on first user click or touch
    const unlockAudio = () => {
        SoundFX.init();
        document.removeEventListener('click', unlockAudio);
        document.removeEventListener('keydown', unlockAudio);
    };
    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });

    // Add Enter key listeners for login
    const inputs = [document.getElementById('username'), document.getElementById('password')];
    inputs.forEach(input => {
        if(input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') handleAuth();
            });
        }
    });

    // Check LocalStorage (Registered) OR SessionStorage (Guest)
    let savedUser = localStorage.getItem("battleship_user");
    let savedPass = localStorage.getItem("battleship_token");

    if (!savedUser) {
        savedUser = sessionStorage.getItem("battleship_user");
        savedPass = sessionStorage.getItem("battleship_token");
    }

    if (savedUser && savedPass) {
        currentUser = savedUser;
        authHeader = `Basic ${savedPass}`;
        // Validate token
        fetch(`${API_URL}/games`, { headers: { 'Authorization': authHeader } })
            .then(response => {
                if (response.ok) {
                    document.getElementById('display-user').innerText = currentUser;
                    checkAdminRole();
                    showScreen('lobby-screen');
                    response.json().then(loadHistory);
                    loadFriends();
                    connectGlobalSocket();
                } else {
                    logout();
                }
            })
            .catch(() => logout());
    }
});

// ================= AUTHENTICATION =================

function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    const title = document.getElementById('auth-title');
    const btn = document.getElementById('btn-action');
    const toggleText = document.getElementById('toggle-text');
    const toggleLink = document.querySelector('.toggle-link a');
    const msg = document.getElementById('auth-msg');

    msg.innerText = ""; // Clear errors

    if (isRegisterMode) {
        title.innerText = "Register";
        btn.innerText = "Create Account";
        toggleText.innerText = "Have an account?";
        toggleLink.innerText = "Login here";
    } else {
        title.innerText = "Battleship";
        btn.innerText = "Login";
        toggleText.innerText = "Need an account?";
        toggleLink.innerText = "Click here";
    }
}

async function handleAuth() {
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const msg = document.getElementById('auth-msg');

    if (!user || !pass) {
        msg.innerText = "Please enter username and password";
        return;
    }

    msg.innerText = "Processing...";

    try {
        if (isRegisterMode) {
            // 1. Register Request
            const regResponse = await fetch(`${AUTH_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user, password: pass })
            });

            if (!regResponse.ok) {
                throw new Error("Username already taken or invalid.");
            }
            // If register success, fall through to login logic
        }

        // 2. Create Credentials
        // Note: In a real app, storing password even in base64 in localStorage is risky.
        // JWT is better, but Basic Auth is fine for this CV project scope.
        const token = btoa(user + ":" + pass);
        const header = `Basic ${token}`;

        // 3. Verify Credentials by fetching data
        const loginResponse = await fetch(`${API_URL}/games`, {
            headers: { 'Authorization': header }
        });

        if (loginResponse.ok) {
            // Success! Save to Session
            localStorage.setItem("battleship_user", user);
            localStorage.setItem("battleship_token", token);

            currentUser = user;
            authHeader = header;
            document.getElementById('display-user').innerText = user;
            checkAdminRole();

            showScreen('lobby-screen');
            loadHistory(await loginResponse.json());
            loadFriends();
            connectGlobalSocket();
            msg.innerText = "";
        } else {
            throw new Error("Invalid username or password.");
        }

    } catch (err) {
        msg.innerText = err.message;
    }
}

function logout() {
    localStorage.removeItem("battleship_user");
    localStorage.removeItem("battleship_token");
    sessionStorage.removeItem("battleship_user");
    sessionStorage.removeItem("battleship_token");

    currentUser = null;
    authHeader = null;
    location.reload();
}

// ================= LOBBY =================
async function createGame() {
    const response = await fetch(`${API_URL}/games`, {
        method: 'POST',
        headers: { 'Authorization': authHeader }
    });
    const game = await response.json();
    enterGame(game);
}

async function joinGame(id) {
    const gameId = id || document.getElementById('gameIdInput').value;
    if(!gameId) return alert("Enter a game ID");

    const response = await fetch(`${API_URL}/games/${gameId}/join`, {
        method: 'POST',
        headers: { 'Authorization': authHeader }
    });
    if (response.ok) enterGame(await response.json());
    else alert("Could not join game (Full or Finished)");
}

function loadHistory(games) {
    const list = document.getElementById('games-list');
    list.innerHTML = '';

    if(games.length === 0) {
        list.innerHTML = '<li>No games played yet.</li>';
        return;
    }

    games.forEach(g => {
        const li = document.createElement('li');

        // Game Info
        const info = document.createElement('span');
        info.innerHTML = `Vs: <strong>${getOpponentName(g)}</strong> <small>(${g.state})</small>`;

        // Action Container
        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '10px';

        // 1. Open Button
        const btnJoin = document.createElement('button');
        btnJoin.innerText = "Open";
        btnJoin.className = "small primary";
        btnJoin.onclick = () => joinGame(g.gameId);

        // 2. Hide Button (NEW)
        const btnHide = document.createElement('button');
        btnHide.innerText = "X";
        btnHide.title = "Remove from history";
        btnHide.className = "small secondary";
        btnHide.style.fontWeight = "bold";
        btnHide.style.backgroundColor = "#ef4444"; // Red
        btnHide.onclick = (e) => {
            e.stopPropagation(); // Prevent triggering other clicks
            hideGame(g.gameId);
        };

        actions.appendChild(btnJoin);
        actions.appendChild(btnHide);

        li.appendChild(info);
        li.appendChild(actions);
        list.appendChild(li);
    });
}

async function hideGame(gameId) {
    if(!confirm("Hide this game from your history?")) return;

    const response = await fetch(`${API_URL}/games/${gameId}/hide`, {
        method: 'POST',
        headers: { 'Authorization': authHeader }
    });

    if (response.ok) {
        // Refresh the list
        fetch(`${API_URL}/games`, { headers: { 'Authorization': authHeader } })
            .then(r => r.json())
            .then(loadHistory);
    } else {
        alert("Failed to hide game.");
    }
}

function getOpponentName(game) {
    if (game.self.playerId === currentUser) {
        return game.opponent ? game.opponent.playerId : "Waiting...";
    }
    return game.self.playerId;
}

// ================= GAME LOGIC =================
function enterGame(game) {
    currentGameId = game.gameId;
    lastSunkCount = (game.opponent && game.opponent.sunkShips) ? game.opponent.sunkShips.length : 0;
    lastHitCountOpponent = (game.opponent && game.opponent.hits) ? game.opponent.hits.length : 0;
    lastMissCountOpponent = (game.opponent && game.opponent.misses) ? game.opponent.misses.length : 0;
    lastHitCountSelf = (game.self && game.self.hits) ? game.self.hits.length : 0;
    lastMissCountSelf = (game.self && game.self.misses) ? game.self.misses.length : 0;
    lastTurnPlayer = game.currentTurnPlayerId;

    document.getElementById('display-game-id').innerText = game.gameId;
    showScreen('game-screen');
    renderGame(game);
    subscribeToGame(currentGameId);

    // Bắt đầu nhạc nền hồi hộp khi vào trận
    SoundFX.startBGM();
}

function leaveGame() {
    SoundFX.stopBGM();
    hideCombatBanner();

    // Do NOT disconnect. Just unsubscribe from the game.
    if (gameSub) gameSub.unsubscribe();
    if (errorSub) errorSub.unsubscribe();

    gameSub = null;
    errorSub = null;
    currentGameId = null;

    // Refresh data
    fetch(`${API_URL}/games`, { headers: { 'Authorization': authHeader } })
        .then(r => r.json())
        .then(loadHistory);

    showScreen('lobby-screen');
}

function showCombatBanner(text, icon = "🎯", isEnemy = false, duration = 3000) {
    const banner = document.getElementById('combat-banner');
    const textEl = document.getElementById('banner-text');
    const iconEl = document.getElementById('banner-icon');
    if (!banner || !textEl) return;

    if (bannerTimeout) clearTimeout(bannerTimeout);

    textEl.innerText = text;
    if (iconEl) iconEl.innerText = icon;

    if (isEnemy) {
        banner.classList.add('enemy-hit');
    } else {
        banner.classList.remove('enemy-hit');
    }

    banner.classList.remove('hidden');
    bannerTimeout = setTimeout(() => {
        banner.classList.add('hidden');
    }, duration);
}

function hideCombatBanner() {
    const banner = document.getElementById('combat-banner');
    if (banner) banner.classList.add('hidden');
    if (bannerTimeout) {
        clearTimeout(bannerTimeout);
        bannerTimeout = null;
    }
}

// ================= RENDERING =================
const ALL_SHIPS = [
    { id: "Carrier", size: 5 }, { id: "Battleship", size: 4 },
    { id: "Cruiser", size: 3 }, { id: "Submarine", size: 3 },
    { id: "Destroyer", size: 2 }
];

function renderGame(state) {
    const prevState = lastKnownState;
    lastKnownState = state;

    document.getElementById('game-state').innerText = state.state;

    // Turn Indicator Logic
    const turnSpan = document.getElementById('turn-indicator');
    if(state.state === 'ACTIVE') {
        if(state.currentTurnPlayerId === currentUser) {
            turnSpan.innerText = " [YOUR TURN - READY TO FIRE]";
            turnSpan.style.color = "#00f0ff";
            turnSpan.style.textShadow = "0 0 10px rgba(0, 240, 255, 0.7)";
        } else {
            turnSpan.innerText = " [ENEMY TURN - ENEMY FIRING]";
            turnSpan.style.color = "#ff2a5f";
            turnSpan.style.textShadow = "0 0 10px rgba(255, 42, 95, 0.7)";
        }
    } else {
        turnSpan.innerText = "";
    }

    // Audio & Combat Event Detection
    if (state.state === 'ACTIVE' || state.state === 'FINISHED') {
        const currentOppHits = (state.opponent && state.opponent.hits) ? state.opponent.hits.length : 0;
        const currentOppMisses = (state.opponent && state.opponent.misses) ? state.opponent.misses.length : 0;
        const currentOppSunk = (state.opponent && state.opponent.sunkShips) ? state.opponent.sunkShips.length : 0;

        const currentSelfHits = (state.self && state.self.hits) ? state.self.hits.length : 0;
        const currentSelfMisses = (state.self && state.self.misses) ? state.self.misses.length : 0;

        // 1. Did current user shoot? (opp hits or opp misses increased)
        if (currentOppHits > lastHitCountOpponent) {
            if (currentOppSunk > lastSunkCount) {
                // Enemy ship sunk!
                SoundFX.playShipSunk();
                showCombatBanner("💥 ENEMY SHIP SUNK! TAKE ANOTHER SHOT!", "🔥", false, 3500);
            } else {
                // Target hit!
                SoundFX.playHit();
                showCombatBanner("🎯 TARGET HIT! TAKE ANOTHER SHOT!", "🎯", false, 3000);
            }
        } else if (currentOppMisses > lastMissCountOpponent) {
            // Splash / Miss
            SoundFX.playMiss();
        }

        // 2. Did enemy shoot me? (self hits or self misses increased)
        if (currentSelfHits > lastHitCountSelf) {
            SoundFX.playHit();
            showCombatBanner("⚠️ FLEET HIT! ENEMY TAKES ANOTHER SHOT!", "🚨", true, 3000);
        } else if (currentSelfMisses > lastMissCountSelf) {
            SoundFX.playMiss();
        }

        lastHitCountOpponent = currentOppHits;
        lastMissCountOpponent = currentOppMisses;
        lastSunkCount = currentOppSunk;
        lastHitCountSelf = currentSelfHits;
        lastMissCountSelf = currentSelfMisses;
    }

    // Setup Controls Logic
    const setupControls = document.getElementById('setup-controls');
    const shipYard = document.getElementById('ship-yard');
    const actions = document.getElementById('placement-actions');

    if (state.state === 'SETUP' || state.state === 'WAITING_FOR_PLAYER') {
        setupControls.classList.remove('hidden');
        if (pendingPlacement) {
            shipYard.classList.add('hidden');
            actions.classList.remove('hidden');
        } else {
            shipYard.classList.remove('hidden');
            actions.classList.add('hidden');
            renderShipYard(state.self.ships);
        }
    } else {
        setupControls.classList.add('hidden');
    }

    renderBoard('my-board', state.self, false);
    renderBoard('opponent-board', state.opponent, true);

    // Game Over Alert
    if (state.state === 'FINISHED') {
        SoundFX.stopBGM();
        if (state.winnerId === currentUser) {
            SoundFX.playWin();
            showCombatBanner("🏆 VICTORY! ENEMY FLEET ANNIHILATED!", "🏆", false, 6000);
        } else {
            SoundFX.playLose();
            showCombatBanner("💀 DEFEAT! YOUR FLEET HAS BEEN SUNK!", "💀", true, 6000);
        }
    }
}

function renderShipYard(placedShips) {
    const container = document.getElementById('ship-yard');
    container.innerHTML = '';

    ALL_SHIPS.forEach(ship => {
        const btn = document.createElement('button');
        btn.className = 'ship-btn';
        btn.innerText = `${ship.id} (${ship.size})`;

        const isPlaced = placedShips.some(s => s.id === ship.id);
        if (isPlaced) btn.disabled = true;

        // Highlight if currently selected
        if (selectedShipType === ship.id) {
            btn.classList.add('selected');
        }

        btn.onclick = () => {
            selectedShipType = ship.id;

            // This attaches the 'onmouseenter' events to the grid cells
            // because selectedShipType is no longer null.
            renderGame(lastKnownState);
        };
        container.appendChild(btn);
    });
}

function handleGridClick(isOpponent, x, y) {
    if (isOpponent) {
        if(!stompClient) return;

        // Phát âm thanh tiếng súng nổ ngay khi khai hoả
        SoundFX.playCannon();

        stompClient.send(`/app/game/${currentGameId}/move`,
            { "playerId": currentUser },
            JSON.stringify({ target: { x, y } })
        );
    } else {

        // 1. Ignore click if we already have a pending placement (must resolve first)
        if (pendingPlacement) return;

        // 2. Ignore if no ship selected
        if (!selectedShipType) return;

        // 3. Store the intent
        const orientation = document.querySelector('input[name="orient"]:checked').value;

        pendingPlacement = {
            x: x,
            y: y,
            shipType: selectedShipType,
            orientation: orientation
        };

        // 4. Trigger re-render to show the "Pending" yellow ship
        // We pass the current game state back into renderGame to refresh the view
        // (We need to store the last known state globally to do this cleanly)
        renderGame(lastKnownState);
    }
}

function renderBoard(elementId, playerData, isOpponent) {
    const container = document.getElementById(elementId);
    container.innerHTML = '';

    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            const cell = document.createElement('div');
            cell.className = 'cell';

            let alreadyShot = false;

            if (playerData) {
                // 1. Render Standard Ships (My ships OR Game Over revealed ships)
                if (playerData.ships && playerData.ships.some(s => s.coordinates.some(c => c.x===x && c.y===y))) {
                    if (isOpponent) {
                        cell.classList.add('ship-revealed'); // Grey for Game Over reveal
                    } else {
                        cell.classList.add('ship'); // Standard grey for me
                    }
                }

                // 2. ISSUE 21: Render Sunk Ships (Opponent only)
                if (isOpponent && playerData.sunkShips && playerData.sunkShips.some(s => s.coordinates.some(c => c.x===x && c.y===y))) {
                    cell.classList.remove('ship-revealed'); // Override grey
                    cell.classList.add('ship-sunk'); // Red border
                }

                // 3. Hits
                if (playerData.hits && playerData.hits.some(c => c.x===x && c.y===y)) {
                    cell.classList.add('hit');
                    alreadyShot = true;
                }
                // 4. Misses
                if (playerData.misses && playerData.misses.some(c => c.x===x && c.y===y)) {
                    cell.classList.add('miss');
                    alreadyShot = true;
                }
            }

            // --- PENDING PLACEMENT (My Board) ---
            if (!isOpponent && pendingPlacement) {
                const shipInfo = ALL_SHIPS.find(s => s.id === pendingPlacement.shipType);
                const p = pendingPlacement;
                let isPendingCell = false;
                for(let i=0; i < shipInfo.size; i++) {
                    const px = p.x + (p.orientation === "HORIZONTAL" ? i : 0);
                    const py = p.y + (p.orientation === "VERTICAL" ? i : 0);
                    if (x === px && y === py) isPendingCell = true;
                }
                if (isPendingCell) cell.classList.add('preview-pending');
            }

            // --- CLICK HANDLERS ---
            if (isOpponent) {
                if (alreadyShot) {
                    cell.style.cursor = 'not-allowed';
                    cell.title = "Already fired here";
                } else {
                    cell.onclick = () => handleGridClick(isOpponent, x, y);
                    cell.style.cursor = 'crosshair';
                }
            } else {
                cell.onclick = () => handleGridClick(isOpponent, x, y);
                // Hover Effects
                if (selectedShipType && !pendingPlacement) {
                    cell.onmouseenter = () => handleShipHover(x, y, playerData);
                    cell.onmouseleave = () => clearPreviews();
                }
            }

            container.appendChild(cell);
        }
    }
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function showError(msg) {
    const el = document.getElementById('error-msg');
    el.innerText = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
}

function handleShipHover(x, y, playerData) {
    if (!selectedShipType) return; // Do nothing if no ship selected from yard

    // 1. Find ship size
    const shipInfo = ALL_SHIPS.find(s => s.id === selectedShipType);
    if (!shipInfo) return;

    const size = shipInfo.size;
    const orientation = document.querySelector('input[name="orient"]:checked').value;

    // 2. Calculate target coordinates
    const coords = [];
    let isValid = true;

    for (let i = 0; i < size; i++) {
        const targetX = x + (orientation === "HORIZONTAL" ? i : 0);
        const targetY = y + (orientation === "VERTICAL" ? i : 0);

        // Check Bounds (0-9)
        if (targetX > 9 || targetY > 9) {
            isValid = false;
            // We still add it to coords to show the red overflow,
            // but only if it's within the visible grid
            if (targetX <= 9 && targetY <= 9) {
                coords.push({ x: targetX, y: targetY });
            }
        } else {
            coords.push({ x: targetX, y: targetY });

            // Check Overlap with existing ships
            // (Note: playerData.ships might be null if board is empty)
            if (playerData.ships && playerData.ships.some(s =>
                s.coordinates.some(c => c.x === targetX && c.y === targetY)
            )) {
                isValid = false;
            }
        }
    }

    // 3. Apply CSS Classes
    coords.forEach(c => {
        // Find the specific cell div.
        // We need a reliable way to find the cell.
        // Let's rely on the DOM order: My Board is the first .board in the DOM
        const boardDiv = document.getElementById('my-board');
        const cellIndex = c.y * 10 + c.x;
        const cell = boardDiv.children[cellIndex];

        if (cell) {
            cell.classList.add(isValid ? 'preview-valid' : 'preview-invalid');
        }
    });
}

function clearPreviews() {
    document.querySelectorAll('.preview-valid, .preview-invalid')
        .forEach(el => {
            el.classList.remove('preview-valid');
            el.classList.remove('preview-invalid');
        });
}

function confirmPlacement() {
    if (!pendingPlacement) return;

    const { x, y, shipType, orientation } = pendingPlacement;

    fetch(`${API_URL}/games/${currentGameId}/place`, {
        method: 'POST',
        headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            shipType: shipType,
            start: { x, y },
            orientation: orientation
        })
    }).then(async r => {
        if (r.ok) {
            const newState = await r.json();

            // 1. Clear current state
            pendingPlacement = null;
            selectedShipType = null;

            // 2. Logic to Auto-Select Next Ship
            const placedShips = newState.self.ships;
            // Find the first ship in ALL_SHIPS that is NOT in placedShips
            const nextShip = ALL_SHIPS.find(s => !placedShips.some(placed => placed.id === s.id));

            if (nextShip) {
                selectedShipType = nextShip.id;
            }

            // 3. Render Game (which will now highlight the new ship)
            renderGame(newState);

            // 4. Clear previews
            clearPreviews();

        } else {
            showError("Invalid Placement (Overlap or Bounds)");
            cancelPlacement();
        }
    });
}

function cancelPlacement() {
    pendingPlacement = null;
    renderGame(lastKnownState);
}

async function handleGuestLogin() {
    const msg = document.getElementById('auth-msg');
    msg.innerText = "Creating guest account...";

    try {
        // 1. Get Credentials from Server
        const response = await fetch(`${AUTH_URL}/guest`, {
            method: 'POST'
        });

        if (!response.ok) throw new Error("Failed to create guest.");

        const creds = await response.json();

        // 2. Log in using those credentials
        const token = btoa(creds.username + ":" + creds.password);
        const header = `Basic ${token}`;

        currentUser = creds.username;
        authHeader = header;

        // 3. Save to SESSION Storage (Ephemeral)
        sessionStorage.setItem("battleship_user", currentUser);
        sessionStorage.setItem("battleship_token", token);

        document.getElementById('display-user').innerText = currentUser;
        checkAdminRole();
        showScreen('lobby-screen');
        loadHistory([]); // New guest has no history
        loadFriends();
        connectGlobalSocket();
        msg.innerText = "";

    } catch (e) {
        msg.innerText = e.message;
    }
}
// ================= SOCIAL FEATURES =================
async function addFriend() {
    const input = document.getElementById('friendInput');
    const username = input.value.trim();
    if(!username) return;

    await fetch(`${API_URL}/social/friends`, {
        method: 'POST',
        headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: username })
    });

    input.value = '';
    loadFriends(); // Refresh list
}


function loadFriends() {
    fetch(`${API_URL}/social/friends`, { headers: { 'Authorization': authHeader } })
        .then(r => r.json())
        .then(friends => {
            const list = document.getElementById('friends-list');
            list.innerHTML = '';

            // ... (empty check) ...

            friends.forEach(friendName => {
                const li = document.createElement('li');

                const span = document.createElement('span');
                span.className = 'friend-name';
                span.innerText = friendName;

                const btnBox = document.createElement('div');
                btnBox.style.display = 'flex';
                btnBox.style.gap = '5px';

                // Challenge Button
                const btnChal = document.createElement('button');
                btnChal.className = 'icon-btn primary';
                btnChal.innerText = "⚔";
                btnChal.title = "Challenge";
                btnChal.onclick = () => sendInvite(friendName);

                // Remove Button (NEW)
                const btnRem = document.createElement('button');
                btnRem.className = "icon-btn secondary";
                btnRem.style.backgroundColor = '#ef4444';
                btnRem.innerText = "🗑";
                btnRem.title = "Remove Friend";
                btnRem.onclick = () => removeFriend(friendName);

                btnBox.appendChild(btnChal);
                btnBox.appendChild(btnRem);

                li.appendChild(span);
                li.appendChild(btnBox);
                list.appendChild(li);
            });
        });
}

async function removeFriend(username) {
    if(!confirm(`Remove ${username} from friends?`)) return;

    await fetch(`${API_URL}/social/friends/${username}`, {
        method: 'DELETE',
        headers: { 'Authorization': authHeader }
    });
    loadFriends();
}

async function sendInvite(username) {
    if(!confirm(`Challenge ${username} to a game?`)) return;

    const response = await fetch(`${API_URL}/social/invite`, {
        method: 'POST',
        headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: username })
    });

    if (response.ok) {
        const gameId = await response.text();
        joinGame(gameId);
    } else {
        // Show the specific error from the server (e.g., "User 'bob' is not online")
        const errorMsg = await response.text();
        alert(errorMsg);
    }
}

function handleIncomingChallenge(notif) {
    if (confirm(notif.message + "\nClick OK to Accept, Cancel to Deny.")) {
        joinGame(notif.gameId);
    } else {
        // Send Decline
        fetch(`${API_URL}/social/invite/decline`, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                gameId: notif.gameId,
                challenger: notif.sender
            })
        });
    }
}

// ================= WEBSOCKETS =================

function connectGlobalSocket() {
    if (stompClient && stompClient.connected) return;

    const socket = new SockJS(WS_URL);
    stompClient = Stomp.over(socket);
    stompClient.debug = null;

    const headers = {
        'Authorization': authHeader // e.g., "Basic dXNlcjpwYXNz..."
    };

    stompClient.connect(headers, function () { // Pass 'headers' as first arg
        console.log("Connected with Auth!");

        // 1. ALWAYS Subscribe to Personal Notifications (Invites)
        stompClient.subscribe(`/topic/user/${currentUser}/notifications`, function (msg) {
            const notif = JSON.parse(msg.body);

            if (notif.type === 'CHALLENGE') {
                handleIncomingChallenge(notif);
            }
            else if (notif.type === 'DECLINED') {
                alert(notif.message);
                leaveGame(); // Kick them out of the "Waiting" room back to Lobby
            }
        });

        // 2. Real-time Online Users Presence topic
        stompClient.subscribe('/topic/online-users', function (msg) {
            const onlineUsers = JSON.parse(msg.body);
            updateOnlineUsersUI(onlineUsers);
        });

        // 3. If we happened to be in a game (e.g. reconnect logic), subscribe now
        if (currentGameId) {
            subscribeToGame(currentGameId);
        }
    });
}

function subscribeToGame(gameId) {
    if (!stompClient || !stompClient.connected) {
        console.error("Socket not connected yet. Waiting...");
        setTimeout(() => subscribeToGame(gameId), 500);
        return;
    }

    // 1. Unsubscribe from previous game if needed
    if (gameSub) gameSub.unsubscribe();
    if (errorSub) errorSub.unsubscribe();

    console.log("Subscribing to Game:", gameId);

    // 2. Subscribe and Store the reference
    gameSub = stompClient.subscribe(`/topic/game/${gameId}/${currentUser}`, function (msg) {
        renderGame(JSON.parse(msg.body));
    });

    errorSub = stompClient.subscribe(`/topic/game/${gameId}/${currentUser}/error`, function (msg) {
        showError(JSON.parse(msg.body).message);
    });
}

function challengeStranger() {
    const input = document.getElementById('friendInput');
    const username = input.value.trim();
    if(!username) return alert("Enter a username to challenge");

    sendInvite(username); // Re-use existing invite logic
}
// ================= KEYBOARD CONTROLS =================

document.addEventListener('keydown', (e) => {
    // Only active if we are in the SETUP phase
    const setupControls = document.getElementById('setup-controls');
    if (setupControls.classList.contains('hidden')) return;

    // Check for 'R' key
    if (e.key.toLowerCase() === 'r') {
        toggleOrientation();
    }
});

function toggleOrientation() {
    const horizBtn = document.querySelector('input[value="HORIZONTAL"]');
    const vertBtn = document.querySelector('input[value="VERTICAL"]');

    if (horizBtn.checked) {
        vertBtn.checked = true;
    } else {
        horizBtn.checked = true;
    }

    // If we have a pending placement (Yellow Ship), update its orientation instantly
    if (pendingPlacement) {
        pendingPlacement.orientation = vertBtn.checked ? "VERTICAL" : "HORIZONTAL";
        renderGame(lastKnownState); // Re-render to show rotation
    }

    // If we just have a ship selected (Green Hover), force a re-render to update hover preview
    if (selectedShipType && !pendingPlacement) {
        renderGame(lastKnownState);
    }
}

// ================= ADMIN DASHBOARD FUNCTIONS =================

let cachedOnlineUsers = [];

function updateOnlineUsersUI(onlineList) {
    cachedOnlineUsers = Array.isArray(onlineList) ? onlineList : Object.keys(onlineList);

    const count = cachedOnlineUsers.length;
    const badge = document.getElementById('admin-radar-badge');
    const headerCount = document.getElementById('admin-online-count');
    if (badge) badge.innerText = count;
    if (headerCount) headerCount.innerText = `${count} Online`;

    const listEl = document.getElementById('admin-online-list');
    if (listEl) {
        listEl.innerHTML = '';
        if (count === 0) {
            listEl.innerHTML = '<li>No active operatives detected on radar.</li>';
        } else {
            cachedOnlineUsers.forEach(uname => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span><span class="status-dot online"></span> <strong>${uname}</strong></span>
                    <button class="small secondary" onclick="challengePlayerDirect('${uname}')">⚔ Challenge</button>
                `;
                listEl.appendChild(li);
            });
        }
    }
}

function checkAdminRole() {
    const btn = document.getElementById('btn-admin-hq');
    if (btn) {
        if (currentUser && currentUser.toLowerCase() === 'quanglb') {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    }
}

function openAdminModal() {
    if (!currentUser || currentUser.toLowerCase() !== 'quanglb') {
        alert("Access Denied: Only account 'quanglb' is authorized to access Admin HQ.");
        return;
    }
    showScreen('admin-screen');
    loadAdminOnline();
    loadAdminUsers();
    loadAdminGames();
}

function closeAdminModal() {
    showScreen('lobby-screen');
}

function switchAdminTab(tabName) {
    ['online', 'users', 'games'].forEach(t => {
        const tabEl = document.getElementById(`tab-${t}`);
        const btnEl = document.getElementById(`tab-btn-${t}`);
        if (tabEl) tabEl.classList.toggle('hidden', t !== tabName);
        if (btnEl) btnEl.classList.toggle('active', t === tabName);
    });
}

async function loadAdminOnline() {
    try {
        const res = await fetch(`${API_URL}/admin/online`, { headers: { 'Authorization': authHeader } });
        if (res.ok) {
            const list = await res.json();
            updateOnlineUsersUI(list);
        }
    } catch (e) {
        console.error("Failed to load online users", e);
    }
}

async function loadAdminUsers() {
    try {
        const res = await fetch(`${API_URL}/admin/users`, { headers: { 'Authorization': authHeader } });
        if (!res.ok) return;
        const users = await res.json();

        const tbody = document.getElementById('admin-users-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        users.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${u.username}</strong></td>
                <td>
                    <span class="table-badge ${u.online ? 'online' : 'offline'}">
                        ${u.online ? 'ONLINE' : 'OFFLINE'}
                    </span>
                </td>
                <td>${u.totalGames}</td>
                <td>
                    <div class="table-actions">
                        <button class="small secondary" onclick="adminResetPassword('${u.username}')">🔑 Reset Pass</button>
                        <button class="small btn-cancel" onclick="adminDeleteUser('${u.username}')">🗑 Delete</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("Failed to load admin users", e);
    }
}

async function adminCreateUser() {
    const username = document.getElementById('admin-new-username').value.trim();
    const password = document.getElementById('admin-new-password').value.trim();

    if (!username || !password) {
        return alert("Please enter both username and password");
    }

    try {
        const res = await fetch(`${API_URL}/admin/users`, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        if (res.ok) {
            alert(`User ${username} created!`);
            document.getElementById('admin-new-username').value = '';
            document.getElementById('admin-new-password').value = '';
            loadAdminUsers();
        } else {
            const err = await res.json();
            alert(err.message || "Failed to create user");
        }
    } catch (e) {
        alert("Error creating user: " + e.message);
    }
}

async function adminResetPassword(username) {
    const newPass = prompt(`Enter new password for ${username} (min 6 characters):`);
    if (!newPass) return;
    if (newPass.length < 6) return alert("Password must be at least 6 characters");

    try {
        const res = await fetch(`${API_URL}/admin/users/${username}/password`, {
            method: 'PUT',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password: newPass })
        });

        if (res.ok) {
            alert(`Password updated for ${username}!`);
        } else {
            alert("Failed to update password");
        }
    } catch (e) {
        alert("Error: " + e.message);
    }
}

async function adminDeleteUser(username) {
    if (!confirm(`Are you sure you want to permanently delete user "${username}"?`)) return;

    try {
        const res = await fetch(`${API_URL}/admin/users/${username}`, {
            method: 'DELETE',
            headers: { 'Authorization': authHeader }
        });

        if (res.ok) {
            alert(`User ${username} deleted`);
            loadAdminUsers();
        } else {
            alert("Failed to delete user");
        }
    } catch (e) {
        alert("Error: " + e.message);
    }
}

async function loadAdminGames() {
    try {
        const res = await fetch(`${API_URL}/admin/games`, { headers: { 'Authorization': authHeader } });
        if (!res.ok) return;
        const games = await res.json();

        const tbody = document.getElementById('admin-games-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (games.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No matches in system.</td></tr>';
            return;
        }

        games.forEach(g => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><small>${g.gameId.substring(0, 8)}...</small></td>
                <td><span class="table-badge ${g.state === 'ACTIVE' ? 'online' : 'offline'}">${g.state}</span></td>
                <td>${g.player1 || '-'} (${g.p1Ships} ships)</td>
                <td>${g.player2 || '-'} (${g.p2Ships} ships)</td>
                <td>${g.winnerId ? `🏆 ${g.winnerId}` : '-'}</td>
                <td>
                    <div class="table-actions">
                        ${g.state !== 'FINISHED' ? `<button class="small secondary" onclick="adminTerminateGame('${g.gameId}')">🛑 End</button>` : ''}
                        <button class="small btn-cancel" onclick="adminDeleteGame('${g.gameId}')">🗑 Delete</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("Failed to load admin games", e);
    }
}

async function adminTerminateGame(gameId) {
    if (!confirm(`Force end match ${gameId}?`)) return;
    try {
        const res = await fetch(`${API_URL}/admin/games/${gameId}/terminate`, {
            method: 'POST',
            headers: { 'Authorization': authHeader }
        });
        if (res.ok) {
            loadAdminGames();
        }
    } catch (e) {
        alert("Error terminating game: " + e.message);
    }
}

async function adminDeleteGame(gameId) {
    if (!confirm(`Permanently delete match ${gameId}?`)) return;
    try {
        const res = await fetch(`${API_URL}/admin/games/${gameId}`, {
            method: 'DELETE',
            headers: { 'Authorization': authHeader }
        });
        if (res.ok) {
            loadAdminGames();
        }
    } catch (e) {
        alert("Error deleting game: " + e.message);
    }
}

function challengePlayerDirect(username) {
    if (username === currentUser) return alert("You cannot challenge yourself!");
    sendInvite(username);
}