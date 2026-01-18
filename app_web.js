import { GoogleGenerativeAI } from "@google/generative-ai";
import { removeBackground } from "@imgly/background-removal";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

// --- 設定檔案路徑 ---
const TEMPLATE_URL = './template.png';    
const DECO_URL = './decoration.png';      

// --- DOM 元素選取 ---
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

// 新增區塊控制元素
const resultArea = document.getElementById('resultArea');
const previewBox = document.getElementById('previewBox');
const resultBox = document.getElementById('resultBox');

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
    
    // 強制設定畫布為 3:4 比例
    const targetWidth = 600;
    const targetHeight = 800;
    snapshotCanvas.width = targetWidth;
    snapshotCanvas.height = targetHeight;

    // 處理鏡像反轉
    context.save();
    context.translate(targetWidth, 0);
    context.scale(-1, 1);

    // 計算視訊裁切區域 (Object-fit: cover 邏輯)
    const videoRatio = webcam.videoWidth / webcam.videoHeight;
    const targetRatio = targetWidth / targetHeight;
    let sw, sh, sx, sy;

    if (videoRatio > targetRatio) {
        sh = webcam.videoHeight;
        sw = sh * targetRatio;
        sx = (webcam.videoWidth - sw) / 2;
        sy = 0;
    } else {
        sw = webcam.videoWidth;
        sh = sw / targetRatio;
        sx = 0;
        sy = (webcam.videoHeight - sh) / 2;
    }

    context.drawImage(webcam, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
    context.restore();

    snapshotCanvas.toBlob((blob) => {
        capturedFile = new File([blob], "selfie.jpg", { type: "image/jpeg" });
        
        // 逐步顯示介面：顯示結果區域與原始照片
        resultArea.classList.remove('hidden');
        previewBox.classList.remove('hidden');
        resultBox.classList.add('hidden'); // 生成前確保 AI 框隱藏

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

// 3. AI 生成邏輯 (模型與 Prompt 嚴禁改動)
async function fileToGenerativePart(file) {
    const base64EncodedDataPromise = new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(file);
    });
    return { inlineData: { data: await base64EncodedDataPromise, mimeType: file.type } };
}

generateBtn.onclick = async () => {
    if (!capturedFile) return alert("請先拍攝照片！");
    
    // 逐步顯示介面：顯示 AI 結果框
    resultBox.classList.remove('hidden');
    loading.classList.remove('hidden');
    resultImg.classList.add('hidden');
    removeBgBtn.classList.add('hidden');

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" });
        const imagePart = await fileToGenerativePart(capturedFile);
        const prompt = "Convert into a classic Japanese black and white manga style portrait. Use clean line art, dramatic screentone shading, and professional ink strokes. Flatter facial planes with a simplified nose and lips, following stylized manga facial proportions. Eyes should be expressive but not hyper-realistic. Use solid fluorescent green color (#00FF00) with no background elements, no scenery, and no textures, focusing entirely on the character. The person should be shown as a waist-up half-body portrait, holding a sheet of paper in their hands, with a surprised and delighted facial expression. Add a clean white outline or border around the outer edge of the portrait, clearly separating the character from the background.";
        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const part = response.candidates[0].content.parts[0];

        if (part.inlineData) {
            resultImg.src = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            resultImg.classList.remove('hidden');
            removeBgBtn.classList.remove('hidden');
        }
    } catch (error) {
        console.error("AI 生成失敗:", error);
        alert("AI 生成失敗，請確認 API Key 是否正確。");
    } finally {
        loading.classList.add('hidden');
    }
};

// 4. 自動去背 + 合成
removeBgBtn.onclick = async () => {
    removeBgBtn.disabled = true;
    removeBgBtn.innerText = "⏳ 正在處理影像...";
    loading.classList.remove('hidden');

    try {
        const config = {
            model: "medium", 
            output: {
                format: "image/png",
                quality: 0.8
            }
        };
        const blob = await removeBackground(resultImg.src, config);
        const portraitUrl = URL.createObjectURL(blob);
        const finalPngUrl = await combineImages(portraitUrl, TEMPLATE_URL, DECO_URL);
        
        resultImg.src = finalPngUrl;
        alert("完成！肖像已疊加並轉換為黑白藝術風格。");
    } catch (error) {
        console.error("處理失敗:", error);
        alert("處理過程中發生錯誤，請檢查底圖與裝飾圖檔案是否存在。");
    } finally {
        removeBgBtn.disabled = false;
        removeBgBtn.innerText = "✨ 自動去背";
        loading.classList.add('hidden');
    }
};

async function combineImages(portraitUrl, templateUrl, decoUrl) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const templateImg = new Image();
        const portraitImg = new Image();
        const decoImg = new Image();
        
        templateImg.src = templateUrl;
        templateImg.onload = () => {
            canvas.width = templateImg.width;
            canvas.height = templateImg.height;
            ctx.drawImage(templateImg, 0, 0);
            
            portraitImg.src = portraitUrl;
            portraitImg.onload = () => {
                ctx.save(); 
                ctx.filter = 'grayscale(100%) contrast(120%)';
                const scale = 0.7; 
                const pWidth = canvas.width * scale;
                const pHeight = (portraitImg.height / portraitImg.width) * pWidth;
                const x = canvas.width - pWidth - 0; 
                const y = canvas.height - pHeight - 95; 

                ctx.drawImage(portraitImg, x, y, pWidth, pHeight);
                ctx.restore(); 

                decoImg.src = decoUrl;
                decoImg.onload = () => {
                    ctx.drawImage(decoImg, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/png'));
                };
                decoImg.onerror = () => reject("載入裝飾圖失敗。");
            };
            portraitImg.onerror = () => reject("載入肖像圖失敗。");
        };
        templateImg.onerror = () => reject("載入底圖失敗。");
    });
}