import { GoogleGenerativeAI } from "@google/generative-ai";

// ⚠️ 重要：請在此處替換為你的 Google AI API Key
const API_KEY = "AIzaSyAMWc4ySqC9yqiJhdYg2vHEbviRJUP2RO4";
const genAI = new GoogleGenerativeAI(API_KEY);

const imageInput = document.getElementById('imageInput');
const generateBtn = document.getElementById('generateBtn');
const previewImg = document.getElementById('previewImg');
const resultImg = document.getElementById('resultImg');
const loading = document.getElementById('loading');

// 當選擇圖片時顯示預覽
imageInput.onchange = evt => {
    const [file] = imageInput.files;
    if (file) {
        previewImg.src = URL.createObjectURL(file);
        previewImg.style.display = 'block';
    }
}

// 將檔案轉為 Base64
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
    const file = imageInput.files[0];
    if (!file) return alert("請先選擇一張圖片！");

    loading.classList.remove('hidden');
    resultImg.style.display = 'none';

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" }); // 目前公開版本通常使用 1.5 系列
        const imagePart = await fileToGenerativePart(file);
        
        const prompt = "Convert this person's photo into a classic Japanese black and white manga style portrait. Use clean line art, dramatic screentone shading, and professional ink strokes. Ensure it looks like a high-quality hand-drawn manga panel.";

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        
        // 注意：目前 Gemini API 直接回傳圖像的功能僅限於特定模型(如你範例中的 gemini-2.5-flash-image)
        // 若使用標準 API，這裡通常會獲得文字描述。
        // 以下邏輯模擬你範例中讀取二進位圖檔的過程：
        
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                resultImg.src = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                resultImg.style.display = 'block';
            } else if (part.text) {
                console.log("AI 回應文字:", part.text);
                alert("AI 回傳了文字描述而非圖像，請確認使用的模型是否支援圖像輸出。");
            }
        }
    } catch (error) {
        console.error(error);
        alert("發生錯誤，請檢查 API Key 或網路連線。");
    } finally {
        loading.classList.add('hidden');
    }
};