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
        if (!isWaitingForInput) return;
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            for (const [hand, words] of Object.entries(VOICE_DICTIONARY)) {
                for (const word of words) {
                    if (transcript.includes(word)) { executeGame(hand, '音声'); return; }
                }
            }
        }
    };
    recognition.onend = () => { if (isWaitingForInput) recognition.start(); };
    recognition.onerror = (event) => { if (isWaitingForInput && event.error !== 'not-allowed') setTimeout(() => recognition.start(), 1000); };
}

const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
function detectHandGesture(landmarks) {
    const isFingerOpen = (tipIndex, baseIndex) => landmarks[tipIndex].y < landmarks[baseIndex].y;
    const indexOpen = isFingerOpen(8, 5); const middleOpen = isFingerOpen(12, 9); const ringOpen = isFingerOpen(16, 13); const pinkyOpen = isFingerOpen(20, 17);
    if (!indexOpen && !middleOpen && !ringOpen && !pinkyOpen) return 'グー';
    if (indexOpen && middleOpen && !ringOpen && !pinkyOpen) return 'チョキ';
    if (indexOpen && middleOpen && ringOpen && pinkyOpen) return 'パー';
    return null;
}
hands.onResults((results) => {
    if (!isWaitingForInput) return;
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const gesture = detectHandGesture(results.multiHandLandmarks[0]);
        if (gesture) {
            gestureBuffer.push(gesture);
            if (gestureBuffer.length > BUFFER_THRESHOLD) gestureBuffer.shift();
            if (gestureBuffer.length === BUFFER_THRESHOLD && gestureBuffer.every(val => val === gesture)) executeGame(gesture, 'カメラ');
        } else { gestureBuffer = []; }
    } else { gestureBuffer = []; }
});
const camera = new Camera(videoElement, { onFrame: async () => { await hands.send({image: videoElement}); }, width: 320, height: 240 });

function executeGame(userHand, source) {
    isWaitingForInput = false;
    if (recognition) recognition.stop();
    gestureBuffer = [];

    let pcHand;
    if (difficulty === 'hospitality') {
        const winAgainstUser = { 'グー': 'パー', 'チョキ': 'グー', 'パー': 'チョキ' };
        const losingHands = HAND_TYPES.filter(h => h !== winAgainstUser[userHand]);
        pcHand = losingHands[Math.floor(Math.random() * losingHands.length)];
    } else if (difficulty === 'oni') {
        const winAgainstUser = { 'グー': 'パー', 'チョキ': 'グー', 'パー': 'チョキ' };
        pcHand = winAgainstUser[userHand];
    } else {
        pcHand = HAND_TYPES[Math.floor(Math.random() * HAND_TYPES.length)];
    }

    const isAiko = (userHand === pcHand);
    let resultMessage = "";

    if (isAiko) {
        resultMessage = "あいこ！";
        playSE('aiko');
        speak(pcHand + "。あいこで");
    } else if (
        (userHand === 'グー' && pcHand === 'チョキ') ||
        (userHand === 'チョキ' && pcHand === 'パー') ||
        (userHand === 'パー' && pcHand === 'グー')
    ) {
        resultMessage = "あなたの勝ち！🎉";
        playSE('win');
        speak(pcHand + "。あなたの勝ち！");
        pcHP -= DAMAGE;
        if (pcHP < 0) pcHP = 0;
        if (pcHP > 0) confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
    } else {
        resultMessage = "AIの勝ち！💻";
        playSE('lose');
        speak(pcHand + "。エーアイの勝ち！");
        playerHP -= DAMAGE;
        if (playerHP < 0) playerHP = 0;
    }

    updateHPUI();
    statusText.innerText = isAiko ? "あいこで..." : "結果発表！";
    cameraStatus.innerText = "判定完了";
    inputSourceDisplay.innerText = source;
    userHandDisplay.innerText = HAND_EMOJIS[userHand];
    pcHandDisplay.innerText = HAND_EMOJIS[pcHand];
    resultText.innerText = resultMessage;

    userHandDisplay.classList.remove('pop-anim'); pcHandDisplay.classList.remove('pop-anim');
    void userHandDisplay.offsetWidth; 
    userHandDisplay.classList.add('pop-anim'); pcHandDisplay.classList.add('pop-anim');

    if (isAiko) {
        setTimeout(() => { resetGame(true); }, 1500); 
    } else {
        if (playerHP === 0 || pcHP === 0) {
            let isPlayerKO = playerHP === 0;
            statusText.innerText = "K.O. 決着！！";
            if (isPlayerKO) {
                resultText.innerText = "GAME OVER...😭";
                speak(difficulty === 'oni' ? "当然の結果だね。さようなら。" : "ゲームオーバー。また遊んでね！");
                winStreak = 0;
            } else {
                winStreak++;
                resultText.innerText = winStreak + "連勝達成！！🏆";
                confetti({ particleCount: 300, spread: 100, origin: { y: 0.5 } });
                speak(difficulty === 'hospitality' ? "お見事です！わざと負けたわけじゃないですよ？" : "すごい！かんぜんしょうり！");
            }
            streakDisplay.style.display = winStreak > 0 ? 'inline-block' : 'none';
            winStreakCountText.innerText = winStreak;
            resetBtn.innerText = "タイトルへ戻る";
        } else {
            resetBtn.innerText = "次のラウンドへ";
        }
        resetBtn.style.display = 'inline-block';
    }
}

function resetGame(isAiko = false) {
    if (playerHP === 0 || pcHP === 0) {
        playerHP = maxHP; pcHP = maxHP; updateHPUI();
    }
    userHandDisplay.innerText = '❔'; pcHandDisplay.innerText = '❔'; resultText.innerText = ''; inputSourceDisplay.innerText = '-';
    resetBtn.style.display = 'none';
    userHandDisplay.classList.remove('pop-anim'); pcHandDisplay.classList.remove('pop-anim');
    void userHandDisplay.offsetWidth;
    userHandDisplay.classList.add('pop-anim'); pcHandDisplay.classList.add('pop-anim');
    
    if (isAiko) { 
        statusText.innerText = "しょ！（声か手を出してください）"; 
        speak("しょ！"); 
    } else { 
        statusText.innerText = "音声かカメラで勝負してください！"; 
        speak("じゃーんけんぽん！"); 
    }
    
    cameraStatus.innerText = "監視中...";
    isWaitingForInput = true;
    if (recognition) { setTimeout(() => { try { recognition.start(); } catch(e) {} }, 100); }
}

startBtn.addEventListener('click', () => {
    startBtn.style.display = 'none';
    // ★ ここにあった「document.getElementById('mode-area').style.display = 'none';」を削除しました！
    // これにより、ゲーム中もずっとモード選択ボタンが表示されたままになります。
    
    statusText.innerText = "カメラとマイクを起動しています...";
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (recognition) { try { recognition.start(); } catch(e) {} }
    if (window.speechSynthesis) { window.speechSynthesis.speak(new SpeechSynthesisUtterance('')); }

    camera.start().then(() => { gameArea.style.display = 'block'; resetGame(); }).catch(err => {
        alert("起動エラー: " + err);
        statusText.innerText = "カメラの起動に失敗しました。";
    });
});
resetBtn.addEventListener('click', () => resetGame(false));