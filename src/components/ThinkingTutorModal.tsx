import React, { useState } from 'react';
import { useLearningState } from '../context/LearningStateContext';
import { soundEngine } from '../utils/soundEngine';
import { Brain, Send, X, ChevronDown, ChevronUp, Award, AlertCircle, BookOpen } from 'lucide-react';

interface ThinkingTutorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
}

const SAMPLE_COMPLEX_QUERIES = [
  {
    domain: 'HOA_HOC',
    label: 'Hóa học 8 · Bản chất điều kiện chuẩn 24,79 L/mol',
    prompt:
      'Giải thích sâu dựa trên phương trình trạng thái khí lí tưởng (PV = nRT) tại sao ở điều kiện chuẩn mới (25 °C, 1 bar) trong SGK KHTN 8 GDPT 2018, 1 mol khí lại chiếm thể tích 24,79 lít thay vì 22,4 lít ở đktc cũ (0 °C, 1 atm)? Cho ví dụ bài toán thực tế.',
  },
  {
    domain: 'VAT_LI',
    label: 'Vật lí 8 · Bài toán Tàu ngầm & Lực đẩy Archimedes',
    prompt:
      'Một tàu ngầm thám hiểm có thể tích vỏ ngoài 500 m³ đang lơ lửng trong nước biển (trọng lượng riêng d = 10 300 N/m³) ở độ sâu h = 120 m. Hãy tính: (1) Áp suất nước biển tác dụng lên vỏ tàu; (2) Lực đẩy Archimedes tác dụng lên tàu; (3) Tàu phải bơm thêm hay xả bớt bao nhiêu kg nước dằn để bắt đầu nổi lên?',
  },
  {
    domain: 'SINH_HOC',
    label: 'Sinh học 8 · Hiệu ứng Bohr, Hemoglobin & Cân bằng pH máu',
    prompt:
      'Phân tích mối liên hệ liên môn Hóa - Sinh: Khi vận động viên chạy nước rút, cơ bắp thải nhiều CO₂ và lactic acid làm giảm pH máu cục bộ. Điều này ảnh hưởng thế nào đến ái lực của Hemoglobin với O₂ và hệ đệm bicarbonate (HCO₃⁻ / H₂CO₃) giữ cân bằng nội môi pH máu ở mức 7,35 - 7,45 như thế nào?',
  },
  {
    domain: 'HOA_HOC',
    label: 'Hóa học 8 · Bài toán Pha trộn Dung dịch & Bảo toàn khối lượng',
    prompt:
      'Hòa tan hoàn toàn 5,6 g kim loại Iron (Fe) vào 200 g dung dịch Hydrochloric acid (HCl) 7,3%. Hãy: (1) Viết phương trình hóa học; (2) Xác định chất dư sau phản ứng; (3) Tính thể tích khí H₂ thoát ra ở 25 °C, 1 bar; (4) Tính nồng độ phần trăm (C%) của các chất tan trong dung dịch sau phản ứng.',
  },
];

export const ThinkingTutorModal: React.FC<ThinkingTutorModalProps> = ({
  isOpen,
  onClose,
  initialPrompt = '',
}) => {
  const { state, recordLearningEvent } = useLearningState();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [domain, setDomain] = useState<'HOA_HOC' | 'VAT_LI' | 'SINH_HOC' | 'CHUNG'>('CHUNG');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ text: string; thoughts: string | null } | null>(null);
  const [showThoughts, setShowThoughts] = useState(true);

  if (!isOpen) return null;

  const unresolvedErrors = state.errorNotebook.filter((e) => !e.resolved);

  const handleAnalyze = async (customPrompt?: string, customDomain?: string) => {
    const queryText = (customPrompt ?? prompt).trim();
    if (!queryText) return;

    soundEngine.playButtonClick();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/gemini/thinking-tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: queryText,
          domain: customDomain || domain,
          contextMode: 'HIGH_THINKING_KHTN8',
          studentLevel: `Cấp độ XP ${state.totalXP}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Không thể phân tích câu hỏi.');
      }
      setResult({
        text: data.text,
        thoughts: data.thoughts || null,
      });
      soundEngine.playAnswerCorrect(1);
      recordLearningEvent(
        'QUEST_STARTED',
        `Phân tích Tư duy Sâu (Thinking High): "${queryText.slice(0, 60)}..." (+30 XP)`,
        { scoreDelta: 30 }
      );
    } catch (err: any) {
      soundEngine.playAnswerWrong();
      setError(err?.message || 'Đã xảy ra lỗi khi gọi mô hình tư duy sâu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-xl text-slate-900">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Brain className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Cố Vấn Chiến Thuật & Giải Toán Chuyên Sâu KHTN 8</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono font-semibold text-emerald-700">Thinking Mode: HIGH</span>
              </div>
              <h2 className="text-base font-bold text-slate-900">
                Phòng Phân Tích Tư Duy Sâu (Hóa Học · Vật Lí · Sinh Học 8)
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Quick Sample Complex Problems */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-700">
              Chọn nhanh bài toán phức tạp hoặc câu hỏi bản chất KHTN 8:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SAMPLE_COMPLEX_QUERIES.map((sq, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setPrompt(sq.prompt);
                    setDomain(sq.domain as any);
                    handleAnalyze(sq.prompt, sq.domain);
                  }}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-left transition-colors cursor-pointer space-y-1"
                >
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{sq.label}</span>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2">{sq.prompt}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Unresolved Mistakes from Student's Error Notebook */}
          {unresolvedErrors.length > 0 && (
            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
              <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span>Phân tích lỗi sai chưa khắc phục trong Sổ Tay Lỗi Sai của em:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {unresolvedErrors.slice(0, 3).map((err) => (
                  <button
                    key={err.id}
                    type="button"
                    onClick={() => {
                      const errPrompt = `Em vừa làm sai câu hỏi KHTN 8 sau: "${err.questionText}". Em đã chọn "${err.userAnswer}" nhưng đáp án đúng là "${err.correctAnswer}". Hãy phân tích sâu vì sao em bị nhầm, giải thích từng bước công thức/bản chất và cho em 1 bài tương tự để luyện lại.`;
                      setPrompt(errPrompt);
                      handleAnalyze(errPrompt, 'CHUNG');
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-amber-100/60 border border-amber-300 rounded-lg text-xs text-amber-950 font-medium cursor-pointer transition-colors text-left"
                  >
                    Giải phẫu lỗi: {err.questionText.slice(0, 65)}...
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom Query Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAnalyze();
            }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">
                Nhập bài toán tự luận, hiện tượng thực tế hoặc phương trình KHTN 8 cần phân tích sâu:
              </label>
              <span className="text-xs text-emerald-700 font-mono font-semibold flex items-center gap-1">
                <Award className="w-3.5 h-3.5" />
                <span>+30 XP mỗi lần suy luận</span>
              </span>
            </div>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ví dụ: Làm thế nào để tính khối lượng muối kết tinh khi làm lạnh dung dịch bão hòa CuSO4 từ 80°C xuống 20°C?..."
              className="w-full rounded-xl border border-slate-300 p-3.5 text-sm text-slate-900 focus:outline-none focus:border-slate-900"
            />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-xs">
                {(['CHUNG', 'HOA_HOC', 'VAT_LI', 'SINH_HOC'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDomain(d)}
                    className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                      domain === d
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {d === 'CHUNG' ? 'Liên môn' : d === 'HOA_HOC' ? 'Hóa học' : d === 'VAT_LI' ? 'Vật lí' : 'Sinh học'}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={loading || !prompt.trim()}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>{loading ? 'Đang suy luận sâu (Thinking High)...' : 'Phân Tích Chuyên Sâu'}</span>
              </button>
            </div>
          </form>

          {/* Loading State */}
          {loading && (
            <div className="p-6 rounded-xl bg-slate-900 text-slate-100 space-y-2 border border-slate-800">
              <div className="flex items-center justify-between text-xs font-mono text-emerald-400">
                <span>ĐANG KÍCH HOẠT TƯ DUY ĐA TẦNG (THINKING LEVEL: HIGH)</span>
                <span>KHTN 8 ENGINE</span>
              </div>
              <p className="text-xs text-slate-300">
                Hệ thống đang kiểm tra đơn vị SI, bảo toàn nguyên tố, điều kiện chuẩn 25 °C / 1 bar và lập luận từng bước...
              </p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          {/* Output Result */}
          {result && (
            <div className="space-y-4">
              {result.thoughts && (
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                  <button
                    type="button"
                    onClick={() => setShowThoughts((s) => !s)}
                    className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-mono font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <span>Chuỗi Suy Luận Nội Tại (Thinking Trace)</span>
                    {showThoughts ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showThoughts && (
                    <div className="p-4 border-t border-slate-200 text-xs font-mono text-slate-600 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                      {result.thoughts}
                    </div>
                  )}
                </div>
              )}

              <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-emerald-700">
                    Lời Giải & Phân Tích Bản Chất Khoa Học Tự Nhiên 8
                  </span>
                  <span className="text-xs font-mono text-slate-500">+30 XP Đã cộng vào hồ sơ</span>
                </div>
                <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {result.text}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
