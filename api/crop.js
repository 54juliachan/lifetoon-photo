import sharp from 'sharp';
import multer from 'multer';

// 設定 Multer 處理記憶體上傳
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024 } // 限制 4MB 以防止 Vercel Timeout
});

// Vercel 需要一個 helper 來處理 middleware
function runMiddleware(req, res, fn) {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) {
                return reject(result);
            }
            return resolve(result);
        });
    });
}

export default async function handler(req, res) {
    // 1. 只允許 POST 請求
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        // 2. 處理檔案上傳
        await runMiddleware(req, res, upload.single('image'));

        if (!req.file) {
            return res.status(400).json({ error: 'No image uploaded' });
        }

        const imageBuffer = req.file.buffer;

        // 3. 使用 Sharp 進行 "智慧裁切" (取代原本的 AI Bounding Box)
        // .trim() 會自動從四周往內縮，切掉顏色數值差異小於 threshold 的背景
        const croppedBuffer = await sharp(imageBuffer)
            .trim({ threshold: 50 }) // 容許度，針對綠幕稍微調高一點
            .toBuffer();

        // 4. 回傳圖片
        res.setHeader('Content-Type', 'image/png');
        res.send(croppedBuffer);

    } catch (error) {
        console.error('Processing error:', error);
        res.status(500).json({ error: 'Image processing failed' });
    }
}

// 必須關閉 Vercel 的預設 body parser 才能讓 multer 運作
export const config = {
    api: {
        bodyParser: false,
    },
};