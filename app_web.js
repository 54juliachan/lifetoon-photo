import { GoogleGenerativeAI } from "@google/generative-ai";
import { removeBackground } from "@imgly/background-removal";

// 導入圖片
import templateSrc from './template.png';
import decoSrc from './decoration.png';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

const TEMPLATE_URL = templateSrc;
const DECO_URL = decoSrc;

// --- DOM 元素 ---
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
const resultArea = document.getElementById('resultArea');
const previewBox = document.getElementById('previewBox');
const resultBox = document.getElementById('resultBox');
const removeBgBtn = document.getElementById('removeBgBtn');

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

// 2. 拍照倒數
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
    const targetWidth = 600;
    const targetHeight = 800;
    snapshotCanvas.width = targetWidth;
    snapshotCanvas.height = targetHeight;

    context.save();
    context.translate(targetWidth, 0);
    context.scale(-1, 1);

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
        
        resultArea.classList.remove('hidden');
        previewBox.classList.remove('hidden');
        resultBox.classList.add('hidden'); 
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

// 3. 輔助函式：檔案轉 Base64
async function fileToGenerativePart(file) {
    const base64EncodedDataPromise = new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(file);
    });
    return { inlineData: { data: await base64EncodedDataPromise, mimeType: file.type } };
}

// 4. 【核心新功能】純前端自動裁切綠幕
async function autoCropGreenScreen(base64Data, mimeType) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = `data:${mimeType};base64,${base64Data}`;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            let minX = canvas.width, minY = canvas.height,VX = 0,VY = 0;

            // 掃描所有像素，找出「不是綠色」的範圍
            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    const i = (y * canvas.width + x) * 4;
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];

                    // 判斷是否為「螢光綠」 (R與B很低，G很高)
                    // 這裡設定一個寬鬆的門檻，避免邊緣有些微雜訊
                    const isGreen = (g > 200 && r < 100 && b < 100);

                    if (!isGreen) {
                        if (x < minX) minX = x;
                        if (x > VX) VX = x;
                        if (y < minY) minY = y;
                        if (y >VY) VY = y;
                    }
                }
            }

            // 如果整張都是綠的（沒偵測到人），就回傳原圖
            if (minX > VX) {
                resolve(img.src);
                return;
            }

            // 加上一點邊距 (Padding)
            const padding = 20;
            minX = Math.max(0, minX - padding);
            minY = Math.max(0, minY - padding);
            VX = Math.min(canvas.width, VX + padding);
            VY = Math.min(canvas.height, VY + padding);
            
            const cropWidth = VX - minX;
            const cropHeight = VY - minY;

            // 建立新的裁切後 Canvas
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = cropWidth;
            cropCanvas.height = cropHeight;
            const cropCtx = cropCanvas.getContext('2d');

            cropCtx.drawImage(canvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
            
            // 轉回 URL
            resolve(cropCanvas.toDataURL('image/png'));
        };
        img.onerror = (e) => reject(e);
    });
}

// 5. 生成按鈕邏輯
generateBtn.onclick = async () => {
    if (!capturedFile) return alert("請先拍攝照片！");
    
    resultBox.classList.remove('hidden');
    loading.classList.remove('hidden');
    resultImg.classList.add('hidden');
    removeBgBtn.classList.add('hidden');

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" });
        
        // --- 修正點：正確宣告 imagePart 變數 ---
        const imagePart = await fileToGenerativePart(capturedFile);
        
        // Prompt 保持不變
        const prompt = "Convert into a classic Japanese black and white manga style portrait. Use clean line art, dramatic screentone shading, and professional ink strokes. Flatter facial planes with a simplified nose and lips, following stylized manga facial proportions. Eyes should be expressive but not hyper-realistic. Use solid fluorescent green color (#00FF00) with no background elements, no scenery, and no textures, focusing entirely on the character. The person should be shown as a waist-up half-body portrait, holding a sheet of paper in their hands, with a surprised and delighted facial expression. Add a clean white outline or border around the outer edge of the portrait, clearly separating the character from the background. The entire portrait should be rendered strictly in black and white, with all shading represented using manga-style screentone dots only, no grayscale or soft gradients. The image should be in a vertical 3:4 aspect ratio. The framing should be tight: the top of the head aligns exactly with the top edge of the image without being cropped, and both elbows touch the left and right edges of the frame while remaining fully visible and not cut off.";
        
        // --- 修正點：使用正確的變數名稱 imagePart ---
        const result = await model.generateContent([prompt, imagePart]);
        
        const response = await result.response;
        const part = response.candidates[0].content.parts[0];

        if (part.inlineData) {
            try {
                // 使用前端自動裁切
                const croppedDataUrl = await autoCropGreenScreen(part.inlineData.data, part.inlineData.mimeType);
                resultImg.src = croppedDataUrl;
                console.log("前端裁切成功！");
            } catch (cropErr) {
                console.warn("裁切失敗，使用原圖", cropErr);
                resultImg.src = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }

            resultImg.classList.remove('hidden');
            removeBgBtn.classList.remove('hidden');
        }
    } catch (error) {
        console.error("AI 生成失敗:", error);
        alert("AI 生成失敗，請確認 API Key。");
    } finally {
        loading.classList.add('hidden');
    }
};

// 6. 去背與合成
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
        alert("完成！");
    } catch (error) {
        console.error("處理失敗:", error);
        alert("處理過程中發生錯誤");
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
        
        templateImg.crossOrigin = "anonymous";
        portraitImg.crossOrigin = "anonymous";
        decoImg.crossOrigin = "anonymous";

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
                decoImg.onerror = () => reject(`載入裝飾圖失敗: ${decoUrl}`);
            };
            portraitImg.onerror = () => reject(`載入肖像圖失敗: ${portraitUrl}`);
        };
        templateImg.onerror = () => reject(`載入底圖失敗: ${templateUrl}`);
    });
}