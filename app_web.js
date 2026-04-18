import { GoogleGenerativeAI } from "@google/generative-ai";
import { removeBackground } from "@imgly/background-removal";
import QRCode from 'qrcode';

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
const generateBtn = document.getElementById('generateBtn');
const homeBtn = document.getElementById('homeBtn'); 
const cameraContainer = document.getElementById('camera-container');
const countdownDisplay = document.getElementById('countdown');
const previewImg = document.getElementById('previewImg');
const resultImg = document.getElementById('resultImg');
const loading = document.getElementById('loading');
const resultArea = document.getElementById('resultArea');
const previewBox = document.getElementById('previewBox');
const resultBox = document.getElementById('resultBox');

// 佔位框與內容元素
const imagePlaceholder = document.getElementById('image-placeholder');
const imageLoadingText = document.getElementById('image-loading-text');
const qrPlaceholder = document.getElementById('qr-placeholder');
const qrLoadingText = document.getElementById('qr-loading-text');
const qrcodeContent = document.getElementById('qrcode-content');
const qrcodeElement = document.getElementById('qrcode');
const downloadLink = document.getElementById('downloadLink');

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

// 4. 純前端自動裁切綠幕
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
            let minX = canvas.width, minY = canvas.height, VX = 0, VY = 0;

            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    const i = (y * canvas.width + x) * 4;
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const isGreen = (g > 200 && r < 100 && b < 100);

                    if (!isGreen) {
                        if (x < minX) minX = x;
                        if (x > VX) VX = x;
                        if (y < minY) minY = y;
                        if (y > VY) VY = y;
                    }
                }
            }

            if (minX > VX) {
                resolve(img.src);
                return;
            }

            const padding = 20;
            minX = Math.max(0, minX - padding);
            minY = Math.max(0, minY - padding);
            VX = Math.min(canvas.width, VX + padding);
            VY = Math.min(canvas.height, VY + padding);
            
            const cropWidth = VX - minX;
            const cropHeight = VY - minY;

            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = cropWidth;
            cropCanvas.height = cropHeight;
            const cropCtx = cropCanvas.getContext('2d');

            cropCtx.drawImage(canvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
            resolve(cropCanvas.toDataURL('image/png'));
        };
        img.onerror = (e) => reject(e);
    });
}

// 5. 圖片合成邏輯
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
                const pHeight = canvas.height * scale;
                const pWidth = (portraitImg.width / portraitImg.height) * pHeight;
                const x = canvas.width - pWidth - 0; 
                const y = canvas.height - pHeight - 110; 

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

// 6. 一鍵全自動處理邏輯
generateBtn.onclick = async () => {
    if (!capturedFile) return alert("請先拍攝照片！");
    
    // 初始化 UI，進入處理狀態
    generateBtn.classList.add('hidden'); 
    openCameraBtn.classList.add('hidden'); 
    previewBox.classList.add('hidden');    
    
    resultBox.classList.remove('hidden');
    loading.classList.remove('hidden');
    homeBtn.classList.add('hidden');
    
    // 重置左右佔位框的狀態 (顯示等待文字，隱藏內容)
    resultImg.classList.add('hidden');
    imageLoadingText.classList.remove('hidden');
    imagePlaceholder.style.backgroundColor = '#e0e0e0'; // 確保背景為灰色
    
    qrcodeContent.classList.add('hidden');
    qrLoadingText.classList.remove('hidden');
    qrPlaceholder.style.backgroundColor = '#e0e0e0'; 

    try {
        // --- 階段 1：AI 漫畫生成 ---
        loading.innerText = "🎨 AI 漫畫家作畫中 (約需 10-15 秒)...";
        const model = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" });
        const imagePart = await fileToGenerativePart(capturedFile);
        
        const prompt = "Convert into a classic Japanese black and white manga style portrait. Use clean line art, dramatic screentone shading, and professional ink strokes. Flatter facial planes with a simplified nose and lips, following stylized manga facial proportions. Eyes should be expressive but not hyper-realistic. Use solid fluorescent green color (#00FF00) with no background elements, no scenery, and no textures, focusing entirely on the character. The person should be shown as a portrait from the hips up, holding a sheet of paper in their hands, with a surprised and delighted facial expression. Add a clean white outline or border around the outer edge of the portrait, clearly separating the character from the background. The entire portrait should be rendered strictly in black and white, shading represented using manga-style screentone dots. The image should be in a vertical 3:5 aspect ratio. The framing should be tight: the top of the head aligns exactly with the top edge of the image without being cropped, and both elbows touch the left and right edges of the frame while remaining fully visible and not cut off.";         
        
        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const part = response.candidates[0].content.parts[0];

        if (!part.inlineData) throw new Error("AI 生成失敗，未回傳有效圖片");

        let currentImgDataUrl;
        try {
            currentImgDataUrl = await autoCropGreenScreen(part.inlineData.data, part.inlineData.mimeType);
        } catch (cropErr) {
            console.warn("裁切失敗，使用原圖", cropErr);
            currentImgDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }

        // --- 階段 2：智慧去背與圖層合成 ---
        loading.innerText = "✨ 正在自動去背與合成拍貼排版...";
        const config = {
            model: "large", 
            output: { format: "image/png", quality: 1.0 }
        };
        const blob = await removeBackground(currentImgDataUrl, config);
        const portraitUrl = URL.createObjectURL(blob);
        const finalPngUrl = await combineImages(portraitUrl, TEMPLATE_URL, DECO_URL);
        
        // 圖片處理完成：更新左側區塊
        resultImg.src = finalPngUrl;
        imageLoadingText.classList.add('hidden'); // 隱藏等待文字
        resultImg.classList.remove('hidden');     // 顯示圖片
        imagePlaceholder.style.backgroundColor = 'transparent'; // 去除佔位灰底

        // --- 階段 3：ImgBB 上傳與產生 QR Code ---
        loading.innerText = "☁️ 正在上傳雲端並產生下載連結...";
        const base64Image = finalPngUrl.split(',')[1];
        const formData = new FormData();
        formData.append("image", base64Image);
        formData.append("expiration", 600); 

        const uploadResponse = await fetch(`https://api.imgbb.com/1/upload?key=${import.meta.env.VITE_IMGBB_API_KEY}`, {
            method: "POST",
            body: formData
        });

        const uploadData = await uploadResponse.json();

        if (uploadData.success) {
            const downloadUrl = uploadData.data.url;

            // 產生 QR Code
            qrcodeElement.innerHTML = ''; 
            const canvas = document.createElement('canvas');
            await QRCode.toCanvas(canvas, downloadUrl, {
                width: 200,
                margin: 2
            });
            qrcodeElement.appendChild(canvas);

            // 上傳完成：更新右側區塊
            qrLoadingText.classList.add('hidden'); // 隱藏等待文字
            qrcodeContent.classList.remove('hidden'); // 顯示 QR Code 內容
            qrPlaceholder.style.backgroundColor = '#f9f9f9'; // 背景換成較亮的底色

            loading.innerText = "🎉 處理完成！請掃描右側 QR Code 儲存圖片。";
            
            // 流程結束，顯示置底的回到主頁按鈕
            homeBtn.classList.remove('hidden'); 
            
        } else {
            throw new Error("上傳到 ImgBB 失敗");
        }

    } catch (error) {
        console.error("處理過程中發生錯誤:", error);
        loading.innerText = "❌ 處理失敗，請重試或確認網路連線。";
        alert("處理過程中發生錯誤，請查看主控台。");
        
        // 失敗復原
        generateBtn.classList.remove('hidden'); 
        openCameraBtn.classList.remove('hidden'); 
        previewBox.classList.remove('hidden');
    }
};

// 7. 回到主頁邏輯
homeBtn.onclick = () => {
    window.location.reload();
};