// --- DOM要素の取得 ---
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

// --- 状態管理 ---
let isWaitingForInput = false;
let gestureBuffer = [];
const BUFFER_THRESHOLD = 5; 
const HAND_TYPES = ['グー', 'チョキ', 'パー'];
const HAND_EMOJIS = { 'グー': '✊', 'チョキ': '✌️', 'パー': '✋' };

const VOICE_DICTIONARY = {
    'グー': ['グー', 'ぐー', 'グウ', 'ぐう', 'ブー', 'ぶー', 'クー', 'くー', 'プー', 'ぷー', 'ルー', 'るー', '空', '食う', '喰う', 'goo', 'Goo'],
    'チョキ': ['チョキ', 'ちょき', 'チキ', 'ちき', '初期', '猪木', 'チョッ', 'ちょっ'],
    'パー': ['パー', 'ぱー', 'パア', 'ぱあ', 'バー', 'ばー', 'パン', 'パッ', 'ぱっ']
};

// ==========================================
// 🎵 電子音(SE)を鳴らす機能
// ==========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSE(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'win') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.1);
        osc.frequency.setValueAtTime(783.99, now + 0.2);
        osc.frequency.setValueAtTime(1046.50, now + 0.3);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
    } else if (type === 'lose') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(80, now + 0.5);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
    } else if (type === 'aiko') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    }
}

// ==========================================
// ★新規追加: PCに喋らせる(音声合成)機能
// ==========================================
function speak(text) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    
    // もし前の言葉を喋っている途中なら、キャンセルして新しい言葉を喋る
    synth.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 1.2; // じゃんけんのテンポに合うように少し早口にする
    synth.speak(utterance);
}

// ==========================================
// 1. 音声認識 (Web Speech API) のセットアップ
// ==========================================
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
                    if (transcript.includes(word)) {
                        executeGame(hand, '音声');
                        return; 
                    }
                }
            }
        }
    };

    recognition.onend = () => {
        if (isWaitingForInput) recognition.start();
    };
    
    recognition.onerror = (event) => {
        console.warn("音声認識エラー:", event.error);
        if (isWaitingForInput && event.error !== 'not-allowed') {
            setTimeout(() => recognition.start(), 1000);
        }
    };

} else {
    alert("お使いのブラウザは音声認識に対応していません。iPhoneならSafari、AndroidならChromeをお使いください！");
}

// ==========================================
// 2. 画像認識 (MediaPipe Hands) のセットアップ
// ==========================================
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});
hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 0, 
    minDetectionConfidence: 0.5, 
    minTrackingConfidence: 0.5
});

function detectHandGesture(landmarks) {
    const isFingerOpen = (tipIndex, baseIndex) => landmarks[tipIndex].y < landmarks[baseIndex].y;
    const indexOpen = isFingerOpen(8, 5);
    const middleOpen = isFingerOpen(12, 9);
    const ringOpen = isFingerOpen(16, 13);
    const pinkyOpen = isFingerOpen(20, 17);

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
            if (gestureBuffer.length > BUFFER_THRESHOLD) {
                gestureBuffer.shift();
            }

            const isStable = gestureBuffer.length === BUFFER_THRESHOLD && 
                             gestureBuffer.every(val => val === gesture);

            if (isStable) {
                executeGame(gesture, 'カメラ');
            }
        } else {
            gestureBuffer = [];
        }
    } else {
        gestureBuffer = [];
    }
});

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({image: videoElement});
    },
    width: 320, 
    height: 240
});

// ==========================================
// 3. ゲームロジック
// ==========================================
function executeGame(userHand, source) {
    isWaitingForInput = false;
    if (recognition) recognition.stop();
    gestureBuffer = [];

    const pcHand = HAND_TYPES[Math.floor(Math.random() * HAND_TYPES.length)];
    const isAiko = (userHand === pcHand);
    let resultMessage = "";

    // ★ここで勝敗に合わせて「音」と「声」を出します！
    if (isAiko) {
        resultMessage = "あいこ！";
        playSE('aiko');
        speak("あいこで");
    } else if (
        (userHand === 'グー' && pcHand === 'チョキ') ||
        (userHand === 'チョキ' && pcHand === 'パー') ||
        (userHand === 'パー' && pcHand === 'グー')
    ) {
        resultMessage = "あなたの勝ち！🎉";
        playSE('win');
        speak(pcHand + "。あなたの勝ち！");
    } else {
        resultMessage = "PCの勝ち！💻";
        playSE('lose');
        speak(pcHand + "。わたしの勝ち！");
    }

    statusText.innerText = isAiko ? "あいこで..." : "結果発表！";
    cameraStatus.innerText = "判定完了";
    inputSourceDisplay.innerText = source;
    userHandDisplay.innerText = HAND_EMOJIS[userHand];
    pcHandDisplay.innerText = HAND_EMOJIS[pcHand];
    resultText.innerText = resultMessage;

    if (isAiko) {
        setTimeout(() => {
            resetGame(true);
        }, 1500); 
    } else {
        resetBtn.style.display = 'inline-block';
    }
}

function resetGame(isAiko = false) {
    userHandDisplay.innerText = '❔';
    pcHandDisplay.innerText = '❔';
    resultText.innerText = '';
    inputSourceDisplay.innerText = '-';
    resetBtn.style.display = 'none';
    
    if (isAiko) {
        statusText.innerText = "しょ！（声か手を出してください）";
        speak("しょ！"); // ★自動で再スタートする時に喋る
    } else {
        statusText.innerText = "音声で「グー・チョキ・パー」と言うか、カメラに手を見せてください";
    }
    
    cameraStatus.innerText = "監視中...";
    
    isWaitingForInput = true;
    if (recognition) {
        setTimeout(() => {
            try { recognition.start(); } catch(e) {}
        }, 100);
    }
}

// ==========================================
// 4. 初期化・イベントリスナー
// ==========================================
startBtn.addEventListener('click', () => {
    startBtn.style.display = 'none';
    statusText.innerText = "カメラとマイクを起動しています...";
    
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (recognition) {
        try { recognition.start(); } catch(e) {}
    }
    
    // ★スマホ向けに音声合成の制限を解除（空の音声を一度だけ再生しておく）
    if (window.speechSynthesis) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    }
    
    camera.start().then(() => {
        gameArea.style.display = 'block';
        resetGame();
    }).catch(err => {
        alert("【カメラ起動エラー】 " + err);
        console.error(err);
        statusText.innerText = "カメラの起動に失敗しました。設定からカメラの権限を確認してください。";
    });
});

resetBtn.addEventListener('click', () => resetGame(false));