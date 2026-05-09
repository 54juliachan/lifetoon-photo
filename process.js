import { GoogleGenerativeAI } from "@google/generative-ai";
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

const eggModal = document.getElementById('eggModal');
const eggIntro = document.getElementById('eggIntro');
const eggInteraction = document.getElementById('eggInteraction');
const startHatchBtn = document.getElementById('startHatchBtn');
const theEgg = document.getElementById('theEgg');
const eggProgress = document.getElementById('eggProgress');
const eggStatusText = document.getElementById('eggStatusText');
const eggGlow = document.getElementById('eggGlow');

// --- 狀態變數 ---
let petProgress = 0;
let isAiDone = false;
let isHatching = false; // 防止重複觸發跳轉
let finalDownloadUrl = null;

// 1. 頁面載入時，立即從 Session 讀取照片
const capturedPhotoDataUrl = sessionStorage.getItem('capturedPhoto');

if (!capturedPhotoDataUrl) {
    alert("找不到拍攝的照片，請重新拍攝！");
    window.location.href = 'index.html';
} else {
    previewImg.src = capturedPhotoDataUrl;
}

// 2. 純 Canvas 綠幕去背與自動裁切
async function chromaKeyAndCrop(base64Data, mimeType) {
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

                    const isGreen = (g > 150 && r < 120 && b < 120);

                    if (isGreen) {
                        data[i + 3] = 0; 
                    } else {
                        if (x < minX) minX = x;
                        if (x > VX) VX = x;
                        if (y < minY) minY = y;
                        if (y > VY) VY = y;
                    }
                }
            }

            ctx.putImageData(imageData, 0, 0);

            if (minX > VX) {
                resolve(canvas.toDataURL('image/png')); 
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

// 3. 圖片合成邏輯
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

// --- 4. 互動與轉換邏輯 ---
generateBtn.onclick = () => {
    generateBtn.classList.add('hidden');
    reTakeBtn.classList.add('hidden');
    previewBox.classList.add('hidden');
    statusText.parentElement.classList.add('hidden'); 
    
    eggModal.classList.remove('hidden');
};

startHatchBtn.onclick = () => {
    eggIntro.classList.add('hidden');
    eggInteraction.classList.remove('hidden');
    
    processAI();
    setupEggInteraction();
};

function setupEggInteraction() {
    let lastX = null, lastY = null;
    
    const handleTouchMove = (e) => {
        e.preventDefault(); 
        let clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let clientY = e.touches ? e.touches[0].clientY : e.clientY;

        if (lastX !== null && lastY !== null) {
            let dist = Math.sqrt(Math.pow(clientX - lastX, 2) + Math.pow(clientY - lastY, 2));
            // 每次滑動距離超過 15px 才算作一次有效撫摸
            if (dist > 15) { 
                // 100 / 30 = 3.34，確保玩家必須紮實滑動約 30 次才會滿 100%
                addProgress(3.34); 
                lastX = clientX;
                lastY = clientY;
            }
        } else {
            lastX = clientX;
            lastY = clientY;
        }
        theEgg.classList.add('touching');
    };

    const endTouch = () => {
        lastX = null; lastY = null;
        theEgg.classList.remove('touching');
    };

    theEgg.addEventListener('mousemove', handleTouchMove);
    theEgg.addEventListener('touchmove', handleTouchMove, {passive: false});
    theEgg.addEventListener('mouseleave', endTouch);
    theEgg.addEventListener('touchend', endTouch);
    theEgg.addEventListener('mouseup', endTouch);
}

function addProgress(amount) {
    if (petProgress >= 100) return;
    
    petProgress += amount;
    
    // 規則 2：如果撫摸超過 30 下但 AI 還沒好，嚴格卡在 99%
    if (petProgress >= 99 && !isAiDone) {
        petProgress = 99; 
        eggStatusText.innerText = "✨ 差一點點了，再加油一下！";
        theEgg.classList.add('egg-shaking-fast');
    } else if (petProgress >= 100) {
        petProgress = 100;
    }
    
    updateEggVisuals();

    // 規則 1：必須滿 100% (代表摸滿 30 下) 且 AI 完成才能跳轉
    if (petProgress >= 100 && isAiDone) {
        hatchAndRedirect();
    }
}

function updateEggVisuals() {
    eggProgress.style.width = `${petProgress}%`;
    
    if (petProgress > 30 && petProgress <= 60) {
        theEgg.classList.add('egg-shaking');
        theEgg.classList.add('cracked-1');
    }
    if (petProgress > 60 && petProgress < 100) {
        theEgg.classList.add('cracked-2');
        // 確保不會覆蓋掉 99% 的提示文字
        if(!isAiDone && petProgress < 99) {
            eggStatusText.innerText = "🥚 蛋殼出現裂痕了，繼續輕撫！";
        }
    }
}

function hatchAndRedirect() {
    if (isHatching) return; // 防止重複觸發
    isHatching = true;

    eggStatusText.innerText = "🌟 孵化完成！";
    theEgg.classList.add('egg-shaking-fast');
    eggGlow.classList.add('flash'); 
    
    setTimeout(() => {
        sessionStorage.setItem('finalResultUrl', finalDownloadUrl);
        window.location.href = 'result.html';
    }, 900); 
}

// AI 處理核心
async function processAI() {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" });
        const base64Data = capturedPhotoDataUrl.split(',')[1];
        const imagePart = { inlineData: { data: base64Data, mimeType: "image/jpeg" } };
        const prompt = "Convert into a classic Japanese black and white manga style portrait. Use clean line art, dramatic screentone shading, and professional ink strokes. Flatter facial planes with a simplified nose and lips, following stylized manga facial proportions. Eyes should be expressive but not hyper-realistic. Use solid fluorescent green color (#00FF00) with no background elements, no scenery, and no textures, focusing entirely on the character. The person should be shown as a portrait from the hips up, a slightly parted mouth, gently widened eyes, and raised eyebrows, expressing mild surprise. Two hands are gently raised to her chest with fingers loosely open. Add a clean white outline or border around the outer edge of the portrait, clearly separating the character from the background. The entire portrait should be rendered strictly in black and white, shading represented using manga-style screentone dots. The image should be in a vertical 3:5 aspect ratio. The framing should be tight: the top of the head aligns exactly with the top edge of the image without being cropped, and both elbows touch the left and right edges of the frame while remaining fully visible and not cut off.";         
        
        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const part = response.candidates[0].content.parts[0];

        if (!part.inlineData) throw new Error("AI 生成失敗");

        let finalPortraitDataUrl;
        try {
            finalPortraitDataUrl = await chromaKeyAndCrop(part.inlineData.data, part.inlineData.mimeType);
        } catch (cropErr) {
            finalPortraitDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }

        const finalPngUrl = await combineImages(finalPortraitDataUrl, TEMPLATE_URL, DECO_URL);

        const formData = new FormData();
        formData.append("image", finalPngUrl.split(',')[1]);
        formData.append("expiration", 600); 

        const uploadResponse = await fetch(`https://api.imgbb.com/1/upload?key=${import.meta.env.VITE_IMGBB_API_KEY}`, {
            method: "POST", body: formData
        });
        const uploadData = await uploadResponse.json();

        if (uploadData.success) {
            finalDownloadUrl = uploadData.data.url;
            isAiDone = true; 
            
            // 情況 A：AI 提早完成，但玩家還沒摸滿 30 下 (< 99%)
            // -> 什麼都不做，不自動補滿，讓玩家繼續摸完剩下的進度。
            if (petProgress < 99) {
                // 如果需要可以開啟這行提示玩家
                // eggStatusText.innerText = "⚡ 故事能量已備妥，請繼續完成孵化！";
            } 
            // 情況 B：玩家早就摸滿 30 下卡在 99% 乾等 AI
            // -> AI 一完成，立即突破 100% 並觸發破殼跳轉
            else {
                petProgress = 100;
                updateEggVisuals();
                hatchAndRedirect();
            }
        } else {
            throw new Error("上傳到 ImgBB 失敗");
        }
    } catch (error) {
        console.error("處理過程中發生錯誤:", error);
        eggModal.classList.add('hidden');
        statusText.parentElement.classList.remove('hidden');
        statusText.innerText = "❌ 處理失敗，請重試或確認網路連線。";
        generateBtn.classList.remove('hidden');
        reTakeBtn.classList.remove('hidden');
        previewBox.classList.remove('hidden');
    }
}