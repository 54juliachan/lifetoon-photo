import { GoogleGenerativeAI } from "@google/generative-ai";
import { removeBackground } from "@imgly/background-removal";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

// 元素選取
const webcam = document.getElementById('webcam');
const snapshotCanvas = document.getElementById('snapshot');
const openCameraBtn = document.getElementById('openCameraBtn');
const takePhotoBtn = document.getElementById('takePhotoBtn');
const cameraContainer = document.getElementById('camera-container');
const countdownDisplay = document.getElementById('countdown');
const generateBtn = document.getElementById('generateBtn');
const removeBgBtn = document.getElementById('removeBgBtn');
const previewImg = document.getElementById('previewImg');
const resultImg = document.getElementById('resultImg');
const loading = document.getElementById('loading');

let capturedFile = null;

// 1. 開啟相機
openCameraBtn.onclick = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        webcam.srcObject = stream;
        cameraContainer.style.display = 'block';
        openCameraBtn.classList.add('hidden');
        takePhotoBtn.classList.remove('hidden');
    } catch (err) {
        alert("無法開啟相機，請檢查權限。");
    }
};

// 2. 倒數計時拍照
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

function captureImage() {
    const context = snapshotCanvas.getContext('2d');
    snapshotCanvas.width = webcam.videoWidth;
    snapshotCanvas.height = webcam.videoHeight;
    context.drawImage(webcam, 0, 0);

    snapshotCanvas.toBlob((blob) => {
        capturedFile = new File([blob], "selfie.jpg", { type: "image/jpeg" });
        previewImg.src = URL.createObjectURL(capturedFile);
        previewImg.classList.remove('hidden');
        generateBtn.classList.remove('hidden');
        
        const stream = webcam.srcObject;
        if (stream) stream.getTracks().forEach(track => track.stop());
        cameraContainer.style.display = 'none';
        takePhotoBtn.classList.add('hidden');
        openCameraBtn.classList.remove('hidden');
        openCameraBtn.innerText = "重新拍攝";
    }, 'image/jpeg');
}

// 3. AI 生成
async function fileToGenerativePart(file) {
    const base64EncodedDataPromise = new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(file);
    });
    return { inlineData: { data: await base64EncodedDataPromise, mimeType: file.type } };
}

generateBtn.onclick = async () => {
    loading.classList.remove('hidden');
    resultImg.classList.add('hidden');
    removeBgBtn.classList.add('hidden');

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" });
        const imagePart = await fileToGenerativePart(capturedFile);
        const prompt = "Japanese B&W manga, clean ink lines, flat stylized facial proportions, expressive non-realistic eyes, solid light grey background.";

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const part = response.candidates[0].content.parts[0];

        if (part.inlineData) {
            resultImg.src = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            resultImg.classList.remove('hidden');
            removeBgBtn.classList.remove('hidden');
        }
    } catch (error) {
        alert("AI 生成失敗。");
    } finally {
        loading.classList.add('hidden');
    }
};

// 4. 自動去背
removeBgBtn.onclick = async () => {
    removeBgBtn.disabled = true;
    removeBgBtn.innerText = "⏳ 去背中...";
    loading.classList.remove('hidden');

    try {
        const blob = await removeBackground(resultImg.src);
        resultImg.src = URL.createObjectURL(blob);
        alert("去背成功！");
    } catch (error) {
        alert("去背失敗。");
    } finally {
        removeBgBtn.disabled = false;
        removeBgBtn.innerText = "✨ 自動去背";
        loading.classList.add('hidden');
    }
};