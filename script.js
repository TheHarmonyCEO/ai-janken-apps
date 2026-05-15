const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const statusText = document.getElementById('status-text');
const gameArea = document.getElementById('game-area');
const videoElement = document.querySelector('.input_video');
const cameraStatus = document.getElementById('camera-status');
const userHandDisplay = document.getElementById('user-hand-display');
const pcHandDisplay = document.getElementById('pc-hand-display');
const resultText = document.getElementById('result-text');
const inputSourceDisplay = document.getElementById('input-source');

const playerHpBar = document.getElementById('player-hp-bar');
const pcHpBar = document.getElementById('pc-hp-bar');
const playerHpText = document.getElementById('player-hp-text');
const pcHpText = document.getElementById('pc-hp-text');
const streakDisplay = document.getElementById('streak-display');
const winStreakCountText = document.getElementById('win-streak-count');

let isWaitingForInput = false;
let gestureBuffer = [];
const BUFFER_THRESHOLD = 5; 
const HAND_TYPES = ['グー', 'チョキ', 'パー'];
const HAND_EMOJIS = { 'グー': '✊', 'チョキ': '✌️', 'パー': '✋' };

let maxHP = 100;
let playerHP = maxHP;
let pcHP = maxHP;
const DAMAGE = 34;
let winStreak = 0;
let difficulty = 'normal';

// 難易度選択のボタン制御
function setDifficulty(mode) {
    difficulty = mode;
    const btns = document.querySelectorAll('.mode-btn');
    btns.forEach(btn => btn.classList.remove('active'));
    if (mode === 'hospitality') document.getElementById('btn-hospitality').classList.add('active');
    if (mode === 'normal') document.getElementById('btn-normal').classList.add('active');
    if (mode === 'oni') document.getElementById('btn-oni').classList.add('active');
}

const VOICE_DICTIONARY = {
    'グー': ['グー', 'ぐー', 'グウ', 'ぐう', 'ブー', 'ぶー', 'クー', 'くー', 'プー', 'ぷー', 'ルー', 'るー', '空', '食う', '喰う', 'goo', 'Goo'],
    'チョキ': ['チョキ', 'ちょき', 'チキ', 'ちき', '初期', '猪木', 'チョッ', 'ちょっ'],
    'パー': ['パー', 'ぱー', 'パア', 'ぱあ', 'バー', 'ばー', 'パン', 'パッ', 'ぱっ']
};

function updateHPUI() {
    playerHpBar.style.width = playerHP + '%';
    pcHpBar.style.width = pcHP + '%';
    playerHpText.innerText = playerHP;
    pcHpText.innerText = pcHP;
    playerHpBar.style.backgroundColor = playerHP <= 30 ? '#f44336' : '#4CAF50';
    pcHpBar.style.backgroundColor = pcHP <= 30 ? '#f44336' : '#4CAF50';
}

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSE(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    if (type === 'win') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(523.25, now); osc.frequency.setValueAtTime(659.25, now + 0.1); osc.frequency.setValueAtTime(783.99, now + 0.2); osc.frequency.setValueAtTime(1046.50, now + 0.3); gain.gain.setValueAtTime(0.5, now); gain.gain.linearRampToValueAtTime(0, now + 0.5); osc.start(now); osc.stop(now + 0.5);
    } else if (type === 'lose') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, now); osc.frequency.linearRampToValueAtTime(80, now + 0.5); gain.gain.setValueAtTime(0.3, now); gain.gain.linearRampToValueAtTime(0, now + 0.5); osc.start(now); osc.stop(now + 0.5);
    } else if (type === 'aiko') {
        osc.type = 'square'; osc.frequency.setValueAtTime(400, now); osc.frequency.exponentialRampToValueAtTime(800, now + 0.1); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.15); osc.start(now); osc.stop(now + 0.15);
    }
}

function speak(text) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 1.2;
    synth.speak(utterance);
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ja-JP';
    recognition.onresult = (event) => {
        if (!isWaitingFor