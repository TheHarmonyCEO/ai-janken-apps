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

// 【超強化】「グー」の聞き間違いをすべて吸収する最強辞書
const VOICE_DICTIONARY = {
    // ブー、ウー、クー、ルー、漢字変換の「空」や英語の「goo」まで網羅！
    'グー': ['グー', 'ぐー', 'グウ', 'ぐう', 'グ', 'ぐ', 'グッ', 'ぐっ', 'ブー', 'ぶー', 'ブルー', 'ウー', 'うー', 'クー', 'くー', 'プー', 'ぷー', 'ルー', 'るー', '空', '食う', '喰う', 'goo', 'Goo'],
    'チョキ': ['チョキ', 'ちょき', 'チョ', 'ちょ', 'チキ', 'ちき', 'チョッ', 'ちょっ', '初期', '猪木'],
    'パー': ['パー', 'ぱー', 'パア', 'ぱあ', 'パ', 'ぱ', 'バー', 'ばー', 'パッ', 'ぱっ', 'パン']
};

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
    console.warn("このブラウザはWeb Speech APIをサポートしていません。");
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

    if (isAiko) {
        resultMessage = "あいこ！";
    } else if (
        (userHand === 'グー' && pcHand === 'チョキ') ||
        (userHand === 'チョキ' && pcHand === 'パー') ||
        (userHand === 'パー' && pcHand === 'グー')
    ) {
        resultMessage = "あなたの勝ち！🎉";
    } else {
        resultMessage = "PCの勝ち！💻";
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
        statusText.innerText = "しょ！（カメラかマイクで手を出してください）";
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
    
    camera.start().then(() => {
        gameArea.style.display = 'block';
        resetGame();
    }).catch(err => {
        console.error(err);
        statusText.innerText = "カメラの起動に失敗しました。権限を確認してください。";
    });
});

resetBtn.addEventListener('click', () => resetGame(false));