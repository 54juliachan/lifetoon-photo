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

const textInputSection = document.getElementById('textInputSection');
const roleInput = document.getElementById('roleInput');
const startIsekaiBtn = document.getElementById('startIsekaiBtn');
// --- 狀態變數 ---
let currentStep = 0;       // 改為步數計算 (0 到 81)
const MAX_STEPS = 81;      // 總共 81 段
let isAiDone = false;
let isHatching = false; 
let finalDownloadUrl = null;
let userRoleText = ""; // 儲存玩家輸入的文字

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
async function combineImages(portraitUrl, templateUrl, decoUrl, customText) { // 🌟 修正：新增了 customText 參數
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
                
                // 調整人像高度比例為畫布的 90%
                const scale = 0.9; 
                const pHeight = canvas.height * scale;
                const pWidth = (portraitImg.width / portraitImg.height) * pHeight;
                
                // 置中對齊
                const x = (canvas.width - pWidth) / 2; 
                const y = canvas.height - pHeight - 110; 

                ctx.drawImage(portraitImg, x, y, pWidth, pHeight);

                decoImg.src = decoUrl;
                decoImg.onload = () => {
                    ctx.drawImage(decoImg, 0, 0, canvas.width, canvas.height);
                    
                    // 確保裝飾圖（decoImg）也套用到灰階濾鏡繪製完成後，才恢復畫布狀態
                    ctx.restore(); 
                    
                    // 🌟 新增：將體驗者輸入的文字繪製在最上層
                    if (customText) {
                        ctx.font = "bold 70px 'Noto Sans TC', sans-serif"; // 設定字體與大小
                        ctx.fillStyle = "#000000"; // 設定字體為黑色
                        ctx.textAlign = "left";  // 靠左對齊
                        ctx.textBaseline = "bottom"; // 垂直對齊底部

                        // 加上白色描邊，確保在任何背景上文字都很清楚
                        ctx.lineWidth = 50;
                        ctx.strokeStyle = "#FFFFFF";

                        // 計算文字位置：水平正中間，垂直貼近畫布底部往上 40px
                        const textX = 50;
                        const textY = canvas.height - 80; 

                        // 先畫黑色描邊，再畫白色實體，才會有漫畫字幕感
                        ctx.strokeText(customText, textX, textY);
                        ctx.fillText(customText, textX, textY);
                    }
                    
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
    
    // 🌟 隱藏原本的開始孵化介紹，顯示輸入文字區塊
    eggIntro.classList.add('hidden'); 
    textInputSection.classList.remove('hidden');
};

// 🌟 新增：點擊「開始穿越」的按鈕邏輯
startIsekaiBtn.onclick = () => {
    const text = roleInput.value.trim();
    if (text.length === 0) {
        alert("請輸入你想成為的角色！");
        return;
    }
    if (text.length > 10) {
        alert("字數請限制在 10 字以內！");
        return;
    }

    userRoleText = text; // 存下玩家輸入的文字

    // 隱藏輸入區，顯示孵蛋區，並開始跑 AI
    textInputSection.classList.add('hidden');
    eggInteraction.classList.remove('hidden');
    
    processAI();
    setupEggInteraction();
};

// (原本的 startHatchBtn.onclick 邏輯就可以刪除了，因為被 startIsekaiBtn 取代)

function setupEggInteraction() {
    let lastX = null, lastY = null;
    
    const handleTouchMove = (e) => {
        e.preventDefault(); 
        let clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let clientY = e.touches ? e.touches[0].clientY : e.clientY;

        if (lastX !== null && lastY !== null) {
            let dist = Math.sqrt(Math.pow(clientX - lastX, 2) + Math.pow(clientY - lastY, 2));
            // 每次滑動超過 100px 算作一次有效撫摸
            if (dist > 100) { 
                addProgress(); 
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

function addProgress() {
    if (currentStep >= MAX_STEPS) return;

    // 前 80 段正常隨著撫摸遞增
    if (currentStep < 80) {
        currentStep++;
    } 
    // 當達到第 80 段時的特殊處理
    else if (currentStep === 80) {
        if (isAiDone) {
            // AI 好了，直接填滿第 81 段
            currentStep = 81;
        } else {
            // AI 尚未準備好，強制卡在第 80 段並提示使用者持續撫摸
            eggStatusText.innerText = "✨ 再差一點就能加載成功了，請持續撫摸！";
            theEgg.classList.add('egg-shaking-fast');
        }
    }
    
    updateEggVisuals();

    // 達到第 81 段 (滿進度) 且 AI 完成時跳轉
    if (currentStep === 81 && isAiDone) {
        hatchAndRedirect();
    }
}

function updateEggVisuals() {
    // 將當前的步數轉換為進度條百分比
    let progressPercent = (currentStep / MAX_STEPS) * 100;
    eggProgress.style.width = `${progressPercent}%`;
    
    // 依據段數觸發裂痕動畫 (大約 1/3 與 2/3 的進度點)
    if (currentStep > 26 && currentStep <= 53) {
        theEgg.classList.add('egg-shaking');
        theEgg.classList.add('cracked-1');
    }
    if (currentStep > 53 && currentStep <= 81) {
        theEgg.classList.add('cracked-2');
        if(!isAiDone && currentStep < 80) {
            eggStatusText.innerText = "🥚 蛋殼出現裂痕了，繼續輕撫！";
        }
    }
}

function hatchAndRedirect() {
    if (isHatching) return; 
    isHatching = true;

    eggStatusText.innerText = "🌟 孵化完成！";
    theEgg.classList.add('hatching-shake');
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
        const prompt = "A classic Japanese black and white manga style portrait, rendered with clean lines, energetic screen tone shading, and professional inking brushstrokes. The face features flattened contours and simplified nose and lips, following stylized manga facial proportions. The eyes are vivid and expressive, showing individual character without being overly realistic. A waist-up bust shot of a character with hands open forward and raised to chest height, palms facing outward, displaying a surprised facial expression. A clean white outline borders the portrait, clearly separating the character from the background. The background is a full-frame pure fluorescent green (#00FF00), completely devoid of background elements, scenery, or textures, placing the entire focus on the character. The portrait must be strictly in black and white, with shading using manga-style screen tones. The image must be a vertical 3:5 aspect ratio. Tight composition: the top of the character's head must perfectly align with the top edge of the image and not be cropped; both elbows must touch the left and right edges of the frame and remain completely visible, without being cropped.";         
        
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

        const finalPngUrl = await combineImages(finalPortraitDataUrl, TEMPLATE_URL, DECO_URL, userRoleText);

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
            
            // 情況 A：玩家還沒摸滿 80 下 (< 80) -> 甚麼都不做，讓玩家繼續摸
            if (currentStep < 80) {
                // 可選：在此印出 console.log 供開發者確認 AI 已準備完畢
                console.log("圖片已就緒，等待玩家完成撫摸");
            } 
            // 情況 B：玩家已經摸滿 80 下，正在卡著等 AI
            // -> 圖片一好，立刻自動填滿最後第 81 段並觸發跳轉
            else if (currentStep === 80) {
                currentStep = 81;
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