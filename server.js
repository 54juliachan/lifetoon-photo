// server.js
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import sharp from 'sharp';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-cpu'; // 或 webgl，但在 Node 環境通常用 cpu
import cocoSsd from '@tensorflow-models/coco-ssd';

const app = express();
const port = 3000;

// 允許跨域請求 (讓前端 Vite 可以呼叫)
app.use(cors());

// 設定記憶體儲存 (不存硬碟，直接在記憶體處理)
const upload = multer({ storage: multer.memoryStorage() });

let model = undefined;

// 1. 啟動伺服器前先載入 AI 模型
(async () => {
    console.log("正在載入 AI 模型...");
    model = await cocoSsd.load();
    console.log("模型載入完成！AI 伺服器就緒。");
})();

app.post('/crop', upload.single('image'), async (req, res) => {
    if (!model) return res.status(503).send("AI 模型尚未就緒");
    if (!req.file) return res.status(400).send("未上傳圖片");

    try {
        const imageBuffer = req.file.buffer;

        // 2. 使用 TFJS 解碼圖片並偵測
        // tf.node.decodeImage 支援 JPG/PNG
        const imgTensor = tf.node.decodeImage(imageBuffer);
        const predictions = await model.detect(imgTensor);
        
        // 釋放 Tensor 記憶體
        imgTensor.dispose();

        // 3. 尋找 "person" (人) 的預測結果
        // Coco-SSD 回傳格式: { bbox: [x, y, width, height], class: "person", score: 0.9 }
        const person = predictions.find(p => p.class === 'person' && p.score > 0.5);

        if (person) {
            console.log("偵測到人物，座標：", person.bbox);
            
            // 取得 Bounding Box 並加上一點「緩衝空間 (Padding)」
            // 避免切得太貼，把你的白色邊框切掉
            const [x, y, w, h] = person.bbox;
            const meta = await sharp(imageBuffer).metadata();
            const padding = 30; // 預留 30px 邊距

            // 計算安全的裁切範圍 (不可超出原圖邊界)
            const extractRegion = {
                left: Math.max(0, Math.floor(x - padding)),
                top: Math.max(0, Math.floor(y - padding)),
                width: Math.min(meta.width, Math.ceil(w + padding * 2)),
                height: Math.min(meta.height, Math.ceil(h + padding * 2))
            };

            // 修正寬高若超出邊界的問題
            if (extractRegion.left + extractRegion.width > meta.width) {
                extractRegion.width = meta.width - extractRegion.left;
            }
            if (extractRegion.top + extractRegion.height > meta.height) {
                extractRegion.height = meta.height - extractRegion.top;
            }

            // 4. 使用 Sharp 執行裁切
            const croppedBuffer = await sharp(imageBuffer)
                .extract(extractRegion)
                .toBuffer();

            // 回傳裁切後的圖片
            res.type('image/png').send(croppedBuffer);
        } else {
            console.log("未偵測到人物，回傳原圖");
            res.type('image/png').send(imageBuffer);
        }

    } catch (error) {
        console.error("處理錯誤:", error);
        res.status(500).send("影像處理失敗");
    }
});

app.listen(port, () => {
    console.log(`AI Server running at http://localhost:${port}`);
});