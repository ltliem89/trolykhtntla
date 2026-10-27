import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '2mb' }));

  const getAiClient = () => {
    return new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  };

  // High-Thinking KHTN 8 Tutor & Strategist endpoint using gemini-4-argon + ThinkingLevel.HIGH
  app.post('/api/gemini/thinking-tutor', async (req, res) => {
    try {
      const { prompt, domain, contextMode, studentLevel } = req.body || {};
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Vui lòng nhập câu hỏi hoặc bài toán KHTN 8 cần phân tích.' });
      }

      const ai = getAiClient();
      const systemInstruction = `Bạn là Cố vấn Khoa học Tự nhiên lớp 8 (Chương trình GDPT 2018 - Kết nối tri thức & Cánh Diều) kiêm Chiến lược gia Đấu trường KHTN 8.
Nhiệm vụ của bạn:
1. Phân tích sâu bản chất khoa học (Hóa học, Vật lí, Sinh học lớp 8) bằng tư duy từng bước chặt chẽ.
2. Lưu ý chuẩn danh pháp quốc tế IUPAC trong SGK mới (ví dụ: iron, copper, oxygen, sulfuric acid, sodium chloride...) và điều kiện chuẩn mới (25 °C, 1 bar: 1 mol khí chiếm 24,79 lít).
3. Trình bày rõ ràng gồm:
   - **Tóm tắt & Bản chất hiện tượng**: Xác định dữ kiện, đại lượng và quy luật khoa học cốt lõi.
   - **Các bước giải & Công thức áp dụng**: Biến đổi từng bước kèm đơn vị chuẩn SI.
   - **Cảnh báo bẫy sai lầm thường gặp**: Chỉ ra lỗi học sinh lớp 8 hay mắc phải (nhầm 22,4 L với 24,79 L, quên đổi cm² sang m² khi tính áp suất p = F/S, nhầm khối lượng riêng D và trọng lượng riêng d...).
   - **Câu hỏi thử thách phản xạ (+XP)**: Đưa ra 1 câu hỏi ngắn giúp học sinh tự kiểm tra độ hiểu bài.
Bối cảnh hiện tại: Phân môn=${domain || 'CHUNG'}, Chế độ=${contextMode || 'DEEP_SOLVE'}, Cấp độ=${studentLevel || 'Lớp 8'}.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-argon',
        contents: prompt,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
          },
        },
      });

      let thoughtSummary = '';
      const parts = response.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if ((part as any).thought && part.text) {
          thoughtSummary += part.text + '\n';
        }
      }

      const answerText = response.text || 'Không nhận được phản hồi từ mô hình.';
      return res.json({
        text: answerText,
        thoughts: thoughtSummary.trim() || null,
        model: 'gemini-4-argon',
        thinkingLevel: 'HIGH',
      });
    } catch (error: any) {
      console.error('Gemini thinking-tutor error:', error);
      return res.status(500).json({
        error: error?.message || 'Đã xảy ra lỗi khi kết nối với Trợ lý Tư duy Sâu.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KHTN 8 Arena Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
