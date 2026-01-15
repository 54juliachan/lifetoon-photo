import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

// DOM 元素
const webcam = document.getElementById('webcam');
const snapshotCanvas = document.getElementById('snapshot');
const openCameraBtn = document.getElementById('openCameraBtn');
const takePhotoBtn = document.getElementById('takePhotoBtn');
const cameraContainer = document.getElementById('camera-container');
const countdownDisplay = document.getElementById('countdown');
const generateBtn = document.getElementById('generateBtn');
const previewImg = document.getElementById('previewImg');
const resultImg = document.getElementById('resultImg');
const loading = document.getElementById('loading');

let capturedFile = null;

// 開啟相機
openCameraBtn.onclick = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user" }, 
            audio: false 
        });
        webcam.srcObject = stream;
        cameraContainer.style.display = 'block';
        openCameraBtn.style.display = 'none';
        takePhotoBtn.style.display = 'inline-block';
    } catch (err) {
        console.error("相機啟動失敗:", err);
        alert("無法存取相機，請確認已授權。");
    }
};

// 倒數拍照邏輯
takePhotoBtn.onclick = () => {
    let count = 3;
    takePhotoBtn.disabled = true;
    countdownDisplay.style.display = 'block';
    countdownDisplay.innerText = count;
    countdownDisplay.classList.add('animate');

    const timer = setInterval(() => {
        count--;
        if (count > 0) {
            countdownDisplay.innerText = count;
            // 重新觸發動畫
            countdownDisplay.classList.remove('animate');
            void countdownDisplay.offsetWidth; 
            countdownDisplay.classList.add('animate');
        } else {
            clearInterval(timer);
            countdownDisplay.style.display = 'none';
            captureImage();
            takePhotoBtn.disabled = false;
        }
    }, 1000);
};

// 擷取影像
function captureImage() {
    const context = snapshotCanvas.getContext('2d');
    snapshotCanvas.width = webcam.videoWidth;
    snapshotCanvas.height = webcam.videoHeight;
    context.drawImage(webcam, 0, 0);

    snapshotCanvas.toBlob((blob) => {
        capturedFile = new File([blob], "selfie.jpg", { type: "image/jpeg" });
        previewImg.src = URL.createObjectURL(capturedFile);
        previewImg.style.display = 'block';
        generateBtn.style.display = 'inline-block';
        
        // 停止相機
        const stream = webcam.srcObject;
        if (stream) stream.getTracks().forEach(track => track.stop());
        cameraContainer.style.display = 'none';
        takePhotoBtn.style.display = 'none';
        openCameraBtn.style.display = 'inline-block';
        openCameraBtn.innerText = "重新拍攝";
    }, 'image/jpeg');
}

async function fileToGenerativePart(file) {
    const base64EncodedDataPromise = new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(file);
    });
    return {
        inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
}

generateBtn.onclick = async () => {
    if (!capturedFile) return alert("請先拍攝照片！");
    loading.classList.remove('hidden');
    resultImg.style.display = 'none';

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" });
        const imagePart = await fileToGenerativePart(capturedFile);
        const prompt = "Convert this person's photo into a classic Japanese black and white manga style portrait. Use clean line art and dramatic screentone shading.";

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                resultImg.src = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                resultImg.style.display = 'block';
            }
        }
    } catch (error) {
        console.error("錯誤:", error);
        alert("生成失敗，請檢查金鑰。");
    } finally {
        loading.classList.add('hidden');
    }
};