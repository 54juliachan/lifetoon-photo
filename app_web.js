import { GoogleGenerativeAI } from "@google/generative-ai";
import { removeBackground } from "@imgly/background-removal";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

// --- 設定檔案路徑 ---
const TEMPLATE_URL = './template.png';    // 底圖路徑
const DECO_URL = './decoration.png';      // 裝飾圖路徑

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

// 3. AI 生成邏輯
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
    loading.classList.remove('hidden');
    resultImg.classList.add('hidden');
    removeBgBtn.classList.add('hidden');

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" });
        const imagePart = await fileToGenerativePart(capturedFile);
        
        // 綠幕專業 Prompt
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

// 4. 自動去背 + 三層影像合成 (底圖/肖像/裝飾) + 轉黑白
removeBgBtn.onclick = async () => {
    removeBgBtn.disabled = true;
    removeBgBtn.innerText = "⏳ 正在處理影像...";
    loading.classList.remove('hidden');

    try {
        // A. 執行去背
        const config = {
            model: "medium", 
            output: {
                format: "image/png",
                quality: 0.8
            }
        };
        const blob = await removeBackground(resultImg.src, config);
        const portraitUrl = URL.createObjectURL(blob);

        // B. 執行三層合成邏輯
        const finalPngUrl = await combineImages(portraitUrl, TEMPLATE_URL, DECO_URL);
        
        // C. 更新結果顯示
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

/**
 * 影像合成核心函式
 * 順序：底圖 (template) -> 肖像 (portrait) -> 裝飾圖 (deco)
 */
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
            
            // 1. 繪製最底層：底圖
            ctx.drawImage(templateImg, 0, 0);
            
            portraitImg.src = portraitUrl;
            portraitImg.onload = () => {
                // 2. 繪製中間層：AI 肖像 (套用黑白濾鏡)
                ctx.save(); 
                ctx.filter = 'grayscale(100%) contrast(120%)';
                
                // 設定肖像位置與大小 (縮放為底圖寬度的 100%，靠右下角)
                const scale = 1.0; 
                const pWidth = canvas.width * scale;
                const pHeight = (portraitImg.height / portraitImg.width) * pWidth;
                const x = canvas.width - pWidth - 0; // 距離右邊 0px
                const y = canvas.height - pHeight - 80; // 距離下面 40px

                ctx.drawImage(portraitImg, x, y, pWidth, pHeight);
                ctx.restore(); // 恢復畫布狀態，確保濾鏡不影響裝飾圖

                // 3. 繪製最上層：裝飾圖
                decoImg.src = decoUrl;
                decoImg.onload = () => {
                    ctx.drawImage(decoImg, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/png'));
                };
                decoImg.onerror = () => reject("載入裝飾圖失敗，請確認檔案路徑。");
            };
            portraitImg.onerror = () => reject("載入肖像圖失敗。");
        };
        templateImg.onerror = () => reject("載入底圖失敗，請確認檔案路徑。");
    });
}