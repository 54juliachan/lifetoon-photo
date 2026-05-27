import { GoogleGenerativeAI } from "@google/generative-ai";
import templateSrc from './template.png';
import deco1 from './decoration1.png';
import deco2 from './decoration2.png';
import deco3 from './decoration3.png';
import deco4 from './decoration4.png';
import deco5 from './decoration5.png';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

const TEMPLATE_URL = templateSrc;
const DECO_OPTIONS = [deco1, deco2, deco3, deco4, deco5];

// ==========================================
// 🌟 在這裡設定你的三組 Prompt 
// ⚠️ 警告：請務必保留與純綠背景 (#00FF00)、黑白 (black and white)、
// 網點 (screen tones)、比例 (3:5) 相關的指令，否則去背將會失敗！
// ==========================================
const PROMPT_OPTIONS = [
    // 預設：經典漫畫風格
    "A classic Japanese black and white manga style portrait, rendered with clean lines, energetic screen tone shading, and professional inking brushstrokes. The face features flattened contours and simplified nose and lips, following stylized manga facial proportions. The eyes are vivid and expressive, showing individual character without being overly realistic. A waist-up bust shot of a character with hands open forward and raised to chest height, palms facing outward, displaying a surprised facial expression. A clean white outline borders the portrait, clearly separating the character from the background. The background is a full-frame pure fluorescent green (#00FF00), completely devoid of background elements, scenery, or textures, placing the entire focus on the character. The portrait must be strictly in black and white, with shading using manga-style screen tones. The image must be a vertical 3:5 aspect ratio. Tight composition: the top of the character's head must perfectly align with the top edge of the image and not be cropped; both elbows must touch the left and right edges of the frame and remain completely visible, without being cropped.",
    
    // 變體一：熱血少年戰鬥風格 (線條更粗獷、眼神堅定)
    "A gritty Japanese shonen action manga style portrait, featuring bold, intense inking, heavy crosshatching, and dramatic screen tone shading. The face has sharper contours and detailed, intense eyes showing strong determination and spirit. A waist-up bust shot of a character with hands open forward and raised to chest height, palms facing outward, displaying a shocked yet fierce expression. A clean white outline borders the portrait. The background is a full-frame pure fluorescent green (#00FF00), completely devoid of background elements. The portrait must be strictly in black and white. The image must be a vertical 3:5 aspect ratio. Tight composition: the top of the character's head must perfectly align with the top edge of the image and not be cropped; both elbows must touch the left and right edges of the frame and remain completely visible.",
    
    // 變體二：閃亮少女漫畫風格 (線條細膩、星星眼)
    "A delicate Japanese shojo manga style portrait, featuring fine and elegant linework, soft screen tones, and sparkling, expressive large eyes. The face has gentle, flattened contours and simplified, elegant features. A waist-up bust shot of a character with hands open forward and raised to chest height, palms facing outward, showing an amazed and dreamy expression. A clean white outline borders the portrait. The background is a full-frame pure fluorescent green (#00FF00), completely devoid of background elements. The portrait must be strictly in black and white, with shading using manga-style screen tones. The image must be a vertical 3:5 aspect ratio. Tight composition: the top of the character's head must perfectly align with the top edge of the image and not be cropped; both elbows must touch the left and right edges of the frame and remain completely visible."
];

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
let currentStep = 0;       
const MAX_STEPS = 81;      
let isAiDone = false;
let isHatching = false; 
let finalDownloadUrl = null;
let userRoleText = ""; 
let aiPortraitPromise = null; 

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
async function combineImages(portraitUrl, templateUrl, decoUrl, customText) { 
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
                
                const scale = 0.9; 
                const pHeight = canvas.height * scale;
                const pWidth = (portraitImg.width / portraitImg.height) * pHeight;
                
                const x = (canvas.width - pWidth) / 2; 
                const y = canvas.height - pHeight - 10; 

                ctx.drawImage(portraitImg, x, y, pWidth, pHeight);

                decoImg.src = decoUrl;
                decoImg.onload = () => {
                    ctx.drawImage(decoImg, 0, 0, canvas.width, canvas.height);
                    
                    ctx.restore(); 
                    
                    if (customText) {
                        ctx.font = "bold 35px 'Noto Sans TC', sans-serif"; 
                        ctx.fillStyle = "#000000"; 
                        ctx.textAlign = "left";  
                        ctx.textBaseline = "bottom"; 

                        ctx.lineWidth = 5;
                        ctx.strokeStyle = "#FFFFFF";

                        const textX = 15;
                        const textY = canvas.height - 10; 

                        ctx.strokeText(customText, textX, textY);
                        ctx.fillText(customText, textX, textY);
                    }
                    
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imageData.data;

                    for (let i = 0; i < data.length; i += 4) {
                        const r = data[i];     
                        const g = data[i + 1]; 
                        const b = data[i + 2]; 

                        const gray = 0.299 * r + 0.587 * g + 0.114 * b;

                        data[i] = gray;     
                        data[i + 1] = gray; 
                        data[i + 2] = gray; 
                    }

                    ctx.putImageData(imageData, 0, 0);
                    
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
    
    eggIntro.classList.add('hidden'); 
    textInputSection.classList.remove('hidden');

    aiPortraitPromise = fetchAIPortrait(); 
};

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

    userRoleText = text; 

    textInputSection.classList.add('hidden');
    eggInteraction.classList.remove('hidden');
    
    finishAIProcessing();
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

    if (currentStep < 80) {
        currentStep++;
    } 
    else if (currentStep === 80) {
        if (isAiDone) {
            currentStep = 81;
        } else {
            eggStatusText.innerText = "✨ 再差一點就能加載成功了，請持續撫摸！";
            theEgg.classList.add('egg-shaking-fast');
        }
    }
    
    updateEggVisuals();

    if (currentStep === 81 && isAiDone) {
        hatchAndRedirect();
    }
}

function updateEggVisuals() {
    let progressPercent = (currentStep / MAX_STEPS) * 100;
    eggProgress.style.width = `${progressPercent}%`;
    
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

// 🌟 上半部：背景偷跑向 Gemini 要圖 + 綠幕去背
async function fetchAIPortrait() {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" });
        const base64Data = capturedPhotoDataUrl.split(',')[1];
        const imagePart = { inlineData: { data: base64Data, mimeType: "image/jpeg" } };
        
        // 🌟 核心改動：從 PROMPT_OPTIONS 陣列中隨機抽取一組 Prompt
        const randomIndex = Math.floor(Math.random() * PROMPT_OPTIONS.length);
        const selectedPrompt = PROMPT_OPTIONS[randomIndex];
        
        console.log(`正在使用第 ${randomIndex + 1} 組 Prompt 進行生成`);
        
        const result = await model.generateContent([selectedPrompt, imagePart]);
        const response = await result.response;
        const part = response.candidates[0].content.parts[0];

        if (!part.inlineData) throw new Error("AI 生成失敗");

        let finalPortraitDataUrl;
        try {
            finalPortraitDataUrl = await chromaKeyAndCrop(part.inlineData.data, part.inlineData.mimeType);
        } catch (cropErr) {
            finalPortraitDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
        
        return finalPortraitDataUrl; 
    } catch (error) {
        console.error("AI 圖片生成或去背失敗:", error);
        throw error;
    }
}

// 🌟 下半部：等使用者輸入文字後，進行圖層疊合與上傳
async function finishAIProcessing() {
    try {
        const finalPortraitDataUrl = await aiPortraitPromise;

        const randomIndex = Math.floor(Math.random() * DECO_OPTIONS.length);
        const randomDecoUrl = DECO_OPTIONS[randomIndex];

        const finalPngUrl = await combineImages(finalPortraitDataUrl, TEMPLATE_URL, randomDecoUrl, userRoleText);

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
            
            if (currentStep < 80) {
                console.log("圖片已就緒，等待玩家完成撫摸");
            } else if (currentStep === 80) {
                currentStep = 81;
                updateEggVisuals();
                hatchAndRedirect();
            }
        } else {
            throw new Error("上傳到 ImgBB 失敗");
        }
    } catch (error) {
        console.error("合成或上傳過程中發生錯誤:", error);
        eggModal.classList.add('hidden');
        statusText.parentElement.classList.remove('hidden');
        statusText.innerText = "❌ 處理失敗，請重試或確認網路連線。";
        generateBtn.classList.remove('hidden');
        reTakeBtn.classList.remove('hidden');
        previewBox.classList.remove('hidden');
    }
}