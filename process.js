import { GoogleGenerativeAI } from "@google/generative-ai";
import { removeBackground } from "@imgly/background-removal";
import templateSrc from './template.png';
import decoSrc from './decoration.png';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

const TEMPLATE_URL = templateSrc;
const DECO_URL = decoSrc;

// --- DOM 元素 ---
const previewImg = document.getElementById('previewImg');
const generateBtn = document.getElementById('generateBtn');
const reTakeBtn = document.getElementById('reTakeBtn');
const statusText = document.getElementById('statusText');
const loading = document.getElementById('loading');
const previewBox = document.getElementById('previewBox');

// 1. 頁面載入時，立即從 Session 讀取照片
const capturedPhotoDataUrl = sessionStorage.getItem('capturedPhoto');

if (!capturedPhotoDataUrl) {
    alert("找不到拍攝的照片，請重新拍攝！");
    window.location.href = 'index.html';
} else {
    // 成功讀取，顯示在預覽框中
    previewImg.src = capturedPhotoDataUrl;
}

// 2. 輔助函式：純前端自動裁切綠幕
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

// 3. 輔助函式：圖片合成邏輯
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

// 4. 開始轉換邏輯
generateBtn.onclick = async () => {
    // 進入載入狀態
    generateBtn.classList.add('hidden');
    reTakeBtn.classList.add('hidden');
    previewBox.classList.add('hidden');
    loading.classList.remove('hidden');
    
    try {
        // --- 階段 1：AI 漫畫生成 ---
        statusText.innerText = "🎨 AI 漫畫家作畫中 (約需 10-15 秒)...";
        const model = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" });
        
        // 將 DataURL 轉換為 Gemini 需要的格式
        const base64Data = capturedPhotoDataUrl.split(',')[1];
        const imagePart = {
            inlineData: {
                data: base64Data,
                mimeType: "image/jpeg"
            }
        };
        
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
        statusText.innerText = "✨ 正在自動去背與合成拍貼排版...";
        const config = {
            model: "large", 
            output: { format: "image/png", quality: 1.0 }
        };
        const blob = await removeBackground(currentImgDataUrl, config);
        const portraitUrl = URL.createObjectURL(blob);
        const finalPngUrl = await combineImages(portraitUrl, TEMPLATE_URL, DECO_URL);

        // --- 階段 3：ImgBB 上傳 ---
        statusText.innerText = "☁️ 正在上傳雲端並產生下載連結...";
        const finalBase64Image = finalPngUrl.split(',')[1];
        const formData = new FormData();
        formData.append("image", finalBase64Image);
        formData.append("expiration", 600); 

        const uploadResponse = await fetch(`https://api.imgbb.com/1/upload?key=${import.meta.env.VITE_IMGBB_API_KEY}`, {
            method: "POST",
            body: formData
        });

        const uploadData = await uploadResponse.json();

        if (uploadData.success) {
            const downloadUrl = uploadData.data.url;

            // 儲存結果並跳轉到結果頁
            sessionStorage.setItem('finalPngData', finalPngUrl);
            sessionStorage.setItem('finalResultUrl', downloadUrl);
            
            window.location.href = 'result.html';
            
        } else {
            throw new Error("上傳到 ImgBB 失敗");
        }

    } catch (error) {
        console.error("處理過程中發生錯誤:", error);
        statusText.innerText = "❌ 處理失敗，請重試或確認網路連線。";
        
        // 失敗復原
        generateBtn.classList.remove('hidden');
        reTakeBtn.classList.remove('hidden');
        previewBox.classList.remove('hidden');
        loading.classList.add('hidden');
    }
};