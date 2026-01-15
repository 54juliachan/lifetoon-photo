import { GoogleGenerativeAI } from "@google/generative-ai";

// 從環境變數讀取 API Key，避免金鑰外洩
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

const imageInput = document.getElementById('imageInput');
const generateBtn = document.getElementById('generateBtn');
const previewImg = document.getElementById('previewImg');
const resultImg = document.getElementById('resultImg');
const loading = document.getElementById('loading');

// 當選擇圖片時顯示預覽
imageInput.onchange = evt => {
    const file = imageInput.files[0]; // 確保抓到第一個檔案
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            previewImg.src = e.target.result; // 使用 Base64 方式預覽，較穩定
            previewImg.style.display = 'block';
        }
        reader.readAsDataURL(file);
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
        // 修正模型名稱：使用穩定支援圖片生成的 
        const model = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" });
        const imagePart = await fileToGenerativePart(file);
        
        const prompt = "Convert this person's photo into a classic Japanese black and white manga style portrait. Use clean line art, dramatic screentone shading, and professional ink strokes. Use flatter facial planes with a simplified nose and lips, following stylized manga facial proportions. Eyes should be expressive but not hyper-realistic.";

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        
        // 處理回傳結果
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                resultImg.src = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                resultImg.style.display = 'block';
            } else if (part.text) {
                console.log("AI 回應文字:", part.text);
                alert("AI 回傳了文字描述，請確認該模型目前在您的區域是否支援圖像輸出。");
            }
        }
    } catch (error) {
        console.error("發生錯誤:", error);
        alert("發生錯誤，請檢查主控台訊息。錯誤原因可能是模型限制或 API 金鑰問題。");
    } finally {
        loading.classList.add('hidden');
    }
};