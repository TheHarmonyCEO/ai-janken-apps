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
let isWaitingForInput = false; // 入力受付中かどうか
let gestureBuffer = [];        // 画像認識のスムージング用バッファ
const BUFFER_THRESHOLD = 12;   // 約0.4秒の連続一致で確定 (30fps想定)
const HAND_TYPES = ['グー', 'チョキ', 'パー'];
const HAND_EMOJIS = { 'グー': '✊', 'チョキ': '✌️', 'パー': '✋' };

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
        if (!isWaitingForInput) return; // 判定済みなら無視

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            
            // 発話の中にじゃんけんの手が含まれているかチェック
            for (const hand of HAND_TYPES) {
                if (transcript.includes(hand)) {
                    executeGame(hand, '音声');
                    return; // 先勝ちで処理終了
                }
            }
        }
    };

    recognition.onend = () => {
        // 待機中であれば自動再起動
        if (isWaitingForInput) recognition.start();
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
    modelComplexity: 1,
    minDetectionConfidence: 0.6, // 誤検知を防ぐための閾値
    minTrackingConfidence: 0.5
});

// 手の形状判定ロジック
function detectHandGesture(landmarks) {
    // 指が開いているかどうかの判定 (y座標を比較)
    // 0: 手首, 5/9/13/17: 指の付け根, 8/12/16/20: 指先
    const isFingerOpen = (tipIndex, baseIndex) => landmarks[tipIndex].y < landmarks[baseIndex].y;

    const indexOpen = isFingerOpen(8, 5);
    const middleOpen = isFingerOpen(12, 9);
    const ringOpen = isFingerOpen(16, 13);
    const pinkyOpen = isFingerOpen(20, 17);

    // 単純化のため、親指を除く4本の指の状態で判定
    if (!indexOpen && !middleOpen && !ringOpen && !pinkyOpen) return 'グー';
    if (indexOpen && middleOpen && !ringOpen && !pinkyOpen) return 'チョキ';
    if (indexOpen && middleOpen && ringOpen && pinkyOpen) return 'パー';
    return null; // 判定不能な中途半端な手
}

hands.onResults((results) => {
    if (!isWaitingForInput) return;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const gesture = detectHandGesture(results.multiHandLandmarks[0]);
        
        if (gesture) {
            // スムージング処理: 一定フレーム連続で同じ形なら確定
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
            gestureBuffer = []; // 形状が崩れたらリセット
        }
    } else {
        gestureBuffer = []; // 手が映っていない場合もリセット
    }
});

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({image: videoElement});
    },
    width: 640,
    height: 480
});

// ==========================================
// 3. ゲームロジック
// ==========================================
function executeGame(userHand, source) {
    // 1. 状態をロック（音声・画像の二重判定を防止）
    isWaitingForInput = false;
    if (recognition) recognition.stop(); // 音声認識を一旦停止
    gestureBuffer = []; // バッファクリア

    // 2. PCの手を決定
    const pcHand = HAND_TYPES[Math.floor(Math.random() * HAND_TYPES.length)];

    // 3. 勝敗判定
    let resultMessage = "";
    if (userHand === pcHand) {
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

    // 4. UI更新
    statusText.innerText = "結果発表！";
    cameraStatus.innerText = "判定完了";
    inputSourceDisplay.innerText = source;
    userHandDisplay.innerText = HAND_EMOJIS[userHand];
    pcHandDisplay.innerText = HAND_EMOJIS[pcHand];
    resultText.innerText = resultMessage;

    // 5. 次のゲームへの導線
    resetBtn.style.display = 'inline-block';
}

function resetGame() {
    userHandDisplay.innerText = '❔';
    pcHandDisplay.innerText = '❔';
    resultText.innerText = '';
    inputSourceDisplay.innerText = '-';
    resetBtn.style.display = 'none';
    
    statusText.innerText = "音声で「グー・チョキ・パー」と言うか、カメラに手を見せてください";
    cameraStatus.innerText = "監視中...";
    
    isWaitingForInput = true;
    if (recognition) recognition.start();
}

// ==========================================
// 4. 初期化・イベントリスナー
// ==========================================
startBtn.addEventListener('click', () => {
    startBtn.style.display = 'none';
    statusText.innerText = "カメラとマイクを起動しています...";
    
    // カメラの起動
    camera.start().then(() => {
        gameArea.style.display = 'block';
        resetGame(); // 待機状態に移行
    }).catch(err => {
        console.error(err);
        statusText.innerText = "カメラの起動に失敗しました。権限を確認してください。";
    });
});

resetBtn.addEventListener('click', resetGame);