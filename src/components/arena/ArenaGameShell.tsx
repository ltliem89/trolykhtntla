import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ARENA_SECTORS,
  ArenaQuestionGate,
  ArenaSectorConfig,
} from '../../data/arenaEncountersData';
import {
  ArenaCanvas60fps,
  ArenaCanvasBridge,
  ArenaCameraPreset,
  ArenaHudSnapshot,
} from './ArenaCanvas60fps';
import { useLearningState } from '../../context/LearningStateContext';
import { useAppNavigation } from '../../context/NavigationContext';
import { calculateLevelFromXP } from '../../utils/masteryEngine';
import { soundEngine } from '../../utils/soundEngine';
import { ThinkingTutorModal } from '../ThinkingTutorModal';

// Existing KHTN 8 v3.0 Modules + New Bioscience Lab Module
import { PrimaryNav } from '../PrimaryNav';
import { HomeModule } from '../../modules/HomeModule';
import { GameWorldModule } from '../../modules/GameWorldModule';
import { BioscienceLabModule } from '../../modules/BioscienceLabModule';
import { OnTapModule } from '../../modules/OnTapModule';
import { TeacherDashboardModule } from '../../modules/TeacherDashboardModule';
import { LyThuyetModule } from '../../modules/LyThuyetModule';
import { CongThucModule } from '../../modules/CongThucModule';
import { DonViModule } from '../../modules/DonViModule';
import { DangBaiModule } from '../../modules/DangBaiModule';
import { BaiTapModule } from '../../modules/BaiTapModule';
import { ThiNghiemModule } from '../../modules/ThiNghiemModule';
import { ThucTienModule } from '../../modules/ThucTienModule';
import { LienMonModule } from '../../modules/LienMonModule';
import { XuatBanModule } from '../../modules/XuatBanModule';
import { GameModule } from '../../modules/GameModule';
import { TuKiemTraModule } from '../../modules/TuKiemTraModule';
import { LoiSaiModule } from '../../modules/LoiSaiModule';
import { TraCuuModule } from '../../modules/TraCuuModule';
import { TienDoModule } from '../../modules/TienDoModule';

export type GameShellState = 'TITLE_SCREEN' | 'PLAYING' | 'PAUSED' | 'VICTORY' | 'GAME_OVER';

export const ArenaGameShell: React.FC = () => {
  const {
    state,
    recordNodeAttempt,
    recordBossDefeat,
    recordLearningEvent,
    addErrorRecord,
    unlockScienceCard,
  } = useLearningState();
  const {
    currentTab,
    navigate,
    isAiTutorOpen,
    aiTutorPrompt,
    openAiTutor,
    closeAiTutor,
    requestedArenaSectorId,
    clearArenaRequest,
  } = useAppNavigation();

  const [gameState, setGameState] = useState<GameShellState>('TITLE_SCREEN');
  const [selectedSector, setSelectedSector] = useState<ArenaSectorConfig>(ARENA_SECTORS[0]);
  const [muted, setMuted] = useState<boolean>(() => soundEngine.isMuted());

  // 3D Viewport Controls & Collapsible Bottom Dock State
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [cameraPreset, setCameraPreset] = useState<ArenaCameraPreset>('TACTICAL');
  const [inspectionPct, setInspectionPct] = useState<number>(0);

  // Command Deck Modal (for full KHTN 8 v3.0 Study Hub & Bioscience Lab access)
  const [showAcademyDeck, setShowAcademyDeck] = useState<boolean>(false);

  // Feedback banner after answering a Science Gate with quick remediation links
  const [gateFeedback, setGateFeedback] = useState<{
    correct: boolean;
    text: string;
    xpDelta: number;
    gate: ArenaQuestionGate;
  } | null>(null);

  const [endSummary, setEndSummary] = useState<{
    victory: boolean;
    finalScore: number;
    waveReached: number;
  }>({
    victory: false,
    finalScore: 0,
    waveReached: 1,
  });

  const [hud, setHud] = useState<ArenaHudSnapshot>({
    hp: 100,
    maxHp: 100,
    bossHp: ARENA_SECTORS[0].bossMaxHp,
    bossMaxHp: ARENA_SECTORS[0].bossMaxHp,
    score: 0,
    combo: 1,
    wave: 1,
    energyCharge: 0,
    crystalsCollected: 0,
    activeGate: null,
  });

  const bridgeRef = useRef<ArenaCanvasBridge | null>(null);

  const handleStartGame = useCallback(
    (sectorOverride?: ArenaSectorConfig) => {
      const targetSector = sectorOverride || selectedSector;
      soundEngine.playButtonClick();
      setGateFeedback(null);
      setShowAcademyDeck(false);
      setInspectionPct(0);
      bridgeRef.current?.setInspectionFactor(0);
      bridgeRef.current?.resetSession(targetSector);
      setGameState('PLAYING');
    },
    [selectedSector]
  );

  // Listen for Arena launch requests triggered from inside any learning module
  useEffect(() => {
    if (!requestedArenaSectorId) return;
    const found =
      ARENA_SECTORS.find((s) => s.id === requestedArenaSectorId) ||
      ARENA_SECTORS.find((s) => s.domain === requestedArenaSectorId) ||
      ARENA_SECTORS[0];
    setSelectedSector(found);
    clearArenaRequest();
    handleStartGame(found);
  }, [requestedArenaSectorId, clearArenaRequest, handleStartGame]);

  const handleTogglePause = useCallback(() => {
    setGameState((prev) => {
      if (prev === 'PLAYING') {
        soundEngine.playButtonClick();
        return 'PAUSED';
      }
      if (prev === 'PAUSED') {
        soundEngine.playButtonClick();
        return 'PLAYING';
      }
      return prev;
    });
  }, []);

  const handleToggleMute = useCallback(() => {
    const nowMuted = soundEngine.toggleMute();
    setMuted(nowMuted);
  }, []);

  const handleCameraPresetChange = (preset: ArenaCameraPreset) => {
    soundEngine.playButtonClick();
    setCameraPreset(preset);
    bridgeRef.current?.setCameraPreset(preset);
  };

  const handleInspectionChange = (val: number) => {
    setInspectionPct(val);
    bridgeRef.current?.setInspectionFactor(val / 100);
  };

  // Deep-link helper to open a specific KHTN 8 module & item from the 3D Arena
  const openSynchronizedSupport = useCallback(
    (
      tabName: any,
      itemId?: string,
      extraCtx?: { lessonId?: string; formulaId?: string; domain?: any }
    ) => {
      soundEngine.playButtonClick();
      navigate({
        tab: tabName,
        id: itemId,
        context: extraCtx,
      });
      setShowAcademyDeck(true);
      if (gameState === 'PLAYING') {
        setGameState('PAUSED');
      }
    },
    [navigate, gameState]
  );

  const handleGateResolved = useCallback(
    (gate: ArenaQuestionGate, isCorrect: boolean, chosenIndex: number) => {
      recordNodeAttempt(gate.knowledgeId, isCorrect, 4500, false);

      if (isCorrect) {
        recordLearningEvent(
          'CHALLENGE_PASSED',
          `Giải mã Cổng Tri Thức Đấu Trường: ${gate.id} (+${gate.xpReward} XP)`,
          { knowledgeId: gate.knowledgeId, scoreDelta: gate.xpReward }
        );
        unlockScienceCard(gate.knowledgeId);
        setGateFeedback({
          correct: true,
          text: `CHÍNH XÁC! +${gate.xpReward} XP · Phóng Tia Phân Tích Quỹ Đạo (-${gate.damageToBoss} HP Boss)!`,
          xpDelta: gate.xpReward,
          gate,
        });
      } else {
        addErrorRecord({
          questionText: gate.prompt,
          userAnswer: gate.options[chosenIndex] || 'Chưa chọn',
          correctAnswer: gate.options[gate.correctIndex],
          category: gate.errorCategory,
          remediationPath: {
            tab: gate.remediationTab,
            id: gate.remediationId || gate.formulaId || gate.lessonId,
            description: gate.explanation,
          },
        });
        setGateFeedback({
          correct: false,
          text: `CHƯA ĐÚNG: ${gate.explanation}`,
          xpDelta: 0,
          gate,
        });
      }
    },
    [recordNodeAttempt, recordLearningEvent, unlockScienceCard, addErrorRecord]
  );

  const handleGameEnd = useCallback(
    (victory: boolean, finalScore: number, waveReached: number) => {
      setEndSummary({ victory, finalScore, waveReached });
      if (victory) {
        const bossId =
          selectedSector.id === 'SECTOR_HOA'
            ? 'BOSS_KHU_A'
            : selectedSector.id === 'SECTOR_VAT'
            ? 'BOSS_KHU_B'
            : selectedSector.id === 'SECTOR_SINH'
            ? 'BOSS_KHU_C'
            : 'BOSS_FINAL';
        recordBossDefeat(bossId, 3, finalScore);
        recordLearningEvent(
          'BOSS_PASSED',
          `Chiến thắng Trùm ${selectedSector.bossName} với ${finalScore} điểm! (+120 XP)`,
          { bossId, scoreDelta: 120 }
        );
        setGameState('VICTORY');
      } else {
        setGameState('GAME_OVER');
      }
    },
    [selectedSector, recordBossDefeat, recordLearningEvent]
  );

  // Title Screen, Dock Toggle [H], & End Modal keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (showAcademyDeck || isAiTutorOpen) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'KeyH') {
        e.preventDefault();
        setDockCollapsed((prev) => !prev);
      } else if (gameState === 'TITLE_SCREEN' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        handleStartGame();
      } else if (
        (gameState === 'VICTORY' || gameState === 'GAME_OVER') &&
        e.code === 'Enter'
      ) {
        e.preventDefault();
        handleStartGame();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [gameState, showAcademyDeck, isAiTutorOpen, handleStartGame]);

  // Clear gate feedback after 7s so student has time to click deep-link remediation if wrong
  useEffect(() => {
    if (!gateFeedback) return;
    const timer = setTimeout(() => setGateFeedback(null), 7000);
    return () => clearTimeout(timer);
  }, [gateFeedback]);

  const levelInfo = calculateLevelFromXP(state.totalXP);
  const activeContextGate = hud.activeGate || gateFeedback?.gate || null;
  const targetLessonId = activeContextGate?.lessonId || selectedSector.defaultLessonId;
  const targetFormulaId = activeContextGate?.formulaId || selectedSector.defaultFormulaId;
  const targetProteinOrCompound =
    activeContextGate?.bioscienceProteinAccession ||
    activeContextGate?.bioscienceCompoundQuery ||
    selectedSector.defaultProteinAccession;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#061318] font-sans select-none">
      {/* 1. ISOLATED THREE.JS 3D WEBGL ARENA CANVAS */}
      <ArenaCanvas60fps
        mode={gameState}
        sector={selectedSector}
        onHudUpdate={setHud}
        onGateResolved={handleGateResolved}
        onGameEnd={handleGameEnd}
        onTogglePause={handleTogglePause}
        onToggleMute={handleToggleMute}
        bridgeRef={bridgeRef}
      />

      {/* =====================================================================
          2. TITLE SCREEN (Full-Viewport, 35%+ Negative Space, Bespoke Inline SVG Lockup)
          ===================================================================== */}
      {gameState === 'TITLE_SCREEN' && !showAcademyDeck && (
        <div className="fixed inset-0 z-20 flex flex-col justify-between px-6 py-7 sm:px-12 sm:py-9 pointer-events-none">
          {/* Top Perimeter Profile & Quick Tools Strip */}
          <div className="flex flex-wrap items-center justify-between gap-4 pointer-events-auto">
            <div className="flex items-center gap-3 bg-[#091926] border border-slate-700/80 px-4 py-2 rounded-xl text-xs text-slate-200">
              <span className="font-bold text-emerald-400">HỒ SƠ NHÀ KHOA HỌC</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">Cấp {levelInfo.level}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono font-semibold text-amber-400 tabular-nums">
                {state.totalXP} XP
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-300 tabular-nums">
                Chuỗi {state.dailyStreak} ngày
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => openSynchronizedSupport('bioscience_lab', targetProteinOrCompound)}
                className="px-3.5 py-2 rounded-xl bg-[#0B2239] hover:bg-[#113252] border border-sky-500/40 text-sky-300 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Phòng Lab Protein 3D & PubChem
              </button>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playButtonClick();
                  openAiTutor(
                    `Hãy hướng dẫn em ôn tập trọng tâm và các bẫy hay sai của ${selectedSector.title} (${selectedSector.subtitle}) trong chương trình KHTN 8 GDPT 2018.`
                  );
                }}
                className="px-3.5 py-2 rounded-xl bg-[#0B2239] hover:bg-[#113252] border border-emerald-500/40 text-emerald-300 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Cố Vấn Tư Duy Sâu (Thinking High)
              </button>
              <button
                type="button"
                onClick={() => openSynchronizedSupport('game_world')}
                className="px-3.5 py-2 rounded-xl bg-[#0B2239] hover:bg-[#113252] border border-amber-500/40 text-amber-300 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Kho Học Liệu & Thế Giới KHTN 8 v3.0
              </button>
              <button
                type="button"
                onClick={handleToggleMute}
                className="px-3 py-2 rounded-xl bg-[#091926] hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-mono cursor-pointer whitespace-nowrap shrink-0"
              >
                {muted ? 'Âm thanh: TẮT [M]' : 'Âm thanh: BẬT [M]'}
              </button>
            </div>
          </div>

          {/* Center Hero Lockup with Generous Negative Space */}
          <div className="max-w-4xl mx-auto w-full text-center space-y-6 my-auto pointer-events-auto">
            {/* Bespoke Inline SVG Title Lockup */}
            <div className="flex justify-center">
              <svg
                viewBox="0 0 680 120"
                className="w-full max-w-[620px] h-auto drop-shadow"
                role="img"
                aria-label="KHTN 8 ARENA — Đấu Trường Khoa Học Tự Nhiên 8"
              >
                <defs>
                  <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#34D399" />
                    <stop offset="50%" stopColor="#38BDF8" />
                    <stop offset="100%" stopColor="#FBBF24" />
                  </linearGradient>
                </defs>
                {/* Left Atomic Emblem */}
                <g transform="translate(68, 60)">
                  <ellipse
                    cx="0"
                    cy="0"
                    rx="34"
                    ry="13"
                    fill="none"
                    stroke="#34D399"
                    strokeWidth="2"
                    transform="rotate(-30)"
                  />
                  <ellipse
                    cx="0"
                    cy="0"
                    rx="34"
                    ry="13"
                    fill="none"
                    stroke="#38BDF8"
                    strokeWidth="2"
                    transform="rotate(30)"
                  />
                  <circle cx="0" cy="0" r="6" fill="#FBBF24" />
                </g>
                {/* Right Force Emblem */}
                <g transform="translate(612, 60)">
                  <polygon
                    points="0,-28 24,-14 24,14 0,28 -24,14 -24,-14"
                    fill="none"
                    stroke="#38BDF8"
                    strokeWidth="2"
                  />
                  <circle cx="0" cy="0" r="6" fill="#34D399" />
                </g>
                <text
                  x="340"
                  y="56"
                  textAnchor="middle"
                  fill="url(#titleGrad)"
                  fontFamily="Outfit, Plus Jakarta Sans, sans-serif"
                  fontWeight="700"
                  fontSize="44"
                  letterSpacing="3"
                >
                  KHTN 8 ARENA 3D
                </text>
                <text
                  x="340"
                  y="90"
                  textAnchor="middle"
                  fill="#E2E8F0"
                  fontFamily="Plus Jakarta Sans, sans-serif"
                  fontWeight="600"
                  fontSize="14"
                  letterSpacing="2.5"
                >
                  ĐẤU TRƯỜNG 3D NGUYÊN TỬ · ÁP SUẤT · NỘI MÔI (GDPT 2018)
                </text>
              </svg>
            </div>

            {/* 4 Interactive Campaign Sector Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-left">
              {ARENA_SECTORS.map((sec) => {
                const isSelected = selectedSector.id === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => {
                      soundEngine.playButtonClick();
                      setSelectedSector(sec);
                      bridgeRef.current?.resetSession(sec);
                    }}
                    className={`p-3.5 rounded-xl border transition-transform cursor-pointer flex flex-col justify-between space-y-2 ${
                      isSelected
                        ? 'bg-[#0D2238] border-emerald-400 scale-[1.02]'
                        : 'bg-[#081523]/90 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="space-y-1">
                      <div
                        className="text-[11px] font-mono font-bold"
                        style={{ color: sec.primaryColor }}
                      >
                        {sec.code}
                      </div>
                      <div className="text-xs font-bold text-white leading-snug">
                        {sec.title}
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-800/80">
                      Trùm 3D: <span className="text-slate-200">{sec.bossName}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Primary Start CTA */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => handleStartGame()}
                className="px-8 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm tracking-wide transition-transform active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
              >
                Bắt Đầu Chiến Dịch 3D ({selectedSector.code}) [Enter / Space]
              </button>
              <button
                type="button"
                onClick={() => openSynchronizedSupport('home')}
                className="px-5 py-3.5 rounded-xl bg-[#0B1E30] hover:bg-[#122C44] border border-slate-700 text-slate-200 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Mở Bàn Học Đồng Bộ KHTN 8 (19 Phân Khu)
              </button>
            </div>
          </div>

          {/* Bottom Single Flat Control-Hint Line */}
          <div className="text-center pointer-events-none">
            <p className="text-xs font-mono text-slate-300 tracking-wide">
              WASD Move · Space Action · 1-4 Quick Answer · H Toggle Dock · Esc Pause
            </p>
          </div>
        </div>
      )}

      {/* =====================================================================
          3. PLAYING HUD + COLLAPSIBLE BOTTOM DOCK (Low-Occlusion >85% Unobstructed, Zero Backdrop-Filter)
          ===================================================================== */}
      {gameState === 'PLAYING' && (
        <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 sm:p-5">
          {/* Top Perimeter Status Row */}
          <div className="flex items-start justify-between gap-4">
            {/* Top-Left Cluster: Vessel Shield HP & Energy Gauge */}
            <div className="bg-[#081523] border border-slate-700/90 rounded-xl px-3.5 py-2.5 space-y-2 pointer-events-auto min-w-[210px]">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-slate-200">
                  <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z" />
                  </svg>
                  <span>Khiên Tàu Nano 3D</span>
                </span>
                <span className="font-mono font-bold text-emerald-400 tabular-nums">
                  {hud.hp}/{hud.maxHp}
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-transform duration-150 origin-left"
                  style={{ transform: `scaleX(${Math.max(0, hud.hp / hud.maxHp)})` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>Năng lượng Cổng KHTN</span>
                <span className="font-mono font-semibold text-amber-400 tabular-nums">
                  {hud.energyCharge}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-transform duration-150 origin-left"
                  style={{ transform: `scaleX(${Math.min(1, hud.energyCharge / 100)})` }}
                />
              </div>
            </div>

            {/* Top-Center Cluster: Boss HP Bar OR Active Quick Science Gate */}
            <div className="flex-1 max-w-xl mx-auto">
              {!hud.activeGate ? (
                <div className="bg-[#081523] border border-slate-700/90 rounded-xl px-4 py-2 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-rose-400 tracking-wide">
                      TRÙM 3D: {selectedSector.bossName} · ĐỢT {hud.wave}
                    </span>
                    <span className="font-mono font-bold text-slate-100 tabular-nums">
                      {hud.bossHp} / {hud.bossMaxHp} HP
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-500 transition-transform duration-150 origin-left"
                      style={{
                        transform: `scaleX(${Math.max(0, hud.bossHp / hud.bossMaxHp)})`,
                      }}
                    />
                  </div>
                </div>
              ) : (
                /* Active Quick-Fire Science Gate Overlay + 1-Click Learner Support Bridges */
                <div className="bg-[#091829] border-2 border-amber-400 rounded-xl p-3.5 space-y-2.5 pointer-events-auto shadow-lg">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-amber-400">
                      ⚡ CỔNG GIẢI MÃ KHTN 8 — BẤM PHÍM [1 - 4] ĐỂ PHÓNG TIA QUỸ ĐẠO
                    </span>
                    <span className="font-mono text-emerald-400 font-semibold tabular-nums">
                      -{hud.activeGate.damageToBoss} HP Boss
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-white leading-snug">
                    {hud.activeGate.prompt}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="font-mono text-sky-300">
                      Gợi ý: {hud.activeGate.formulaHint}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {hud.activeGate.formulaId && (
                        <button
                          type="button"
                          onClick={() =>
                            openSynchronizedSupport('cong_thuc', hud.activeGate!.formulaId, {
                              formulaId: hud.activeGate!.formulaId,
                              domain: hud.activeGate!.domain,
                            })
                          }
                          className="px-2 py-0.5 rounded bg-teal-900 hover:bg-teal-800 border border-teal-500/50 text-teal-200 font-semibold cursor-pointer"
                        >
                          Máy tính Công thức
                        </button>
                      )}
                      {hud.activeGate.lessonId && (
                        <button
                          type="button"
                          onClick={() =>
                            openSynchronizedSupport('ly_thuyet', hud.activeGate!.lessonId, {
                              lessonId: hud.activeGate!.lessonId,
                              domain: hud.activeGate!.domain,
                            })
                          }
                          className="px-2 py-0.5 rounded bg-indigo-900 hover:bg-indigo-800 border border-indigo-500/50 text-indigo-200 font-semibold cursor-pointer"
                        >
                          Xem Bài học
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          openAiTutor(
                            `Hãy hướng dẫn em từng bước giải câu hỏi này trong Đấu trường KHTN 8: "${hud.activeGate!.prompt}" (Gợi ý: ${hud.activeGate!.formulaHint})`
                          )
                        }
                        className="px-2 py-0.5 rounded bg-emerald-900 hover:bg-emerald-800 border border-emerald-500/50 text-emerald-200 font-semibold cursor-pointer"
                      >
                        Hỏi AI Tư Duy Sâu
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {hud.activeGate.options.map((opt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => bridgeRef.current?.triggerGateAnswer(idx)}
                        className="px-3 py-1.5 rounded-lg bg-[#0F2742] hover:bg-emerald-600 text-left text-xs text-slate-100 hover:text-white border border-slate-700 font-medium transition-colors cursor-pointer flex items-center gap-2"
                      >
                        <span className="font-mono font-bold text-amber-400 shrink-0">
                          [{idx + 1}]
                        </span>
                        <span className="truncate">{opt}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Answer Consequence Toast + Direct Remediation Bridges */}
              {gateFeedback && !hud.activeGate && (
                <div
                  className={`mt-2 px-3.5 py-2.5 rounded-xl border text-xs space-y-2 pointer-events-auto ${
                    gateFeedback.correct
                      ? 'bg-[#06281E] border-emerald-500 text-emerald-200'
                      : 'bg-[#2C0B14] border-rose-500 text-rose-200'
                  }`}
                >
                  <div className="font-semibold">{gateFeedback.text}</div>
                  {!gateFeedback.correct && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rose-500/30">
                      <span className="text-[11px] text-rose-300 font-medium">
                        Hỗ trợ khắc phục ngay:
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          openSynchronizedSupport(
                            gateFeedback.gate.remediationTab,
                            gateFeedback.gate.remediationId ||
                              gateFeedback.gate.formulaId ||
                              gateFeedback.gate.lessonId
                          )
                        }
                        className="px-2.5 py-1 rounded bg-rose-900 hover:bg-rose-800 border border-rose-400/50 text-white text-[11px] font-semibold cursor-pointer"
                      >
                        Ôn ngay Kiến thức gốc
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          openAiTutor(
                            `Em vừa trả lời sai câu hỏi: "${gateFeedback.gate.prompt}". Đáp án đúng là "${
                              gateFeedback.gate.options[gateFeedback.gate.correctIndex]
                            }". Hãy phân tích lỗi sai và chỉ cho em mẹo nhớ công thức chuẩn GDPT 2018!`
                          )
                        }
                        className="px-2.5 py-1 rounded bg-emerald-800 hover:bg-emerald-700 border border-emerald-400/50 text-emerald-100 text-[11px] font-semibold cursor-pointer"
                      >
                        Nhờ Cố Vấn AI Giải Thích
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Top-Right Cluster: Score, Combo, XP & Quick Controls */}
            <div className="bg-[#081523] border border-slate-700/90 rounded-xl px-3.5 py-2.5 space-y-2 pointer-events-auto">
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <div className="text-[10px] text-slate-400">ĐIỂM ĐẤU TRƯỜNG</div>
                  <div className="font-mono font-bold text-sm text-white tabular-nums">
                    {hud.score}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">CHUỖI COMBO</div>
                  <div className="font-mono font-bold text-sm text-amber-400 tabular-nums">
                    x{hud.combo}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">TỔNG XP</div>
                  <div className="font-mono font-bold text-sm text-emerald-400 tabular-nums">
                    {state.totalXP}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => openSynchronizedSupport('game_world')}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-sky-300 cursor-pointer whitespace-nowrap shrink-0"
                >
                  Học viện KHTN 8
                </button>
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-mono text-slate-300 cursor-pointer whitespace-nowrap shrink-0"
                >
                  {muted ? 'Tắt tiếng' : 'Âm thanh'}
                </button>
                <button
                  type="button"
                  onClick={handleTogglePause}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-mono text-amber-300 cursor-pointer whitespace-nowrap shrink-0"
                >
                  Tạm dừng [Esc]
                </button>
              </div>
            </div>
          </div>

          {/* =================================================================
              COLLAPSIBLE BOTTOM DOCK (<= 15% Viewport Footprint, Solid Surface)
              ================================================================= */}
          <div className="max-w-5xl w-full mx-auto pointer-events-auto">
            {dockCollapsed ? (
              <div className="flex items-center justify-between bg-[#081523] border border-slate-700/90 rounded-xl px-4 py-2 text-xs text-slate-300">
                <span className="font-mono text-[11px]">
                  WASD Di chuyển 3D · Space Bắn/Lướt · 1-4 Giải mã Cổng KHTN
                </span>
                <button
                  type="button"
                  onClick={() => setDockCollapsed(false)}
                  className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 font-semibold text-xs cursor-pointer"
                >
                  ▴ Mở Bảng Điều Khiển 3D & Liên Kết Học Tập [H]
                </button>
              </div>
            ) : (
              <div className="bg-[#081523] border border-slate-700/90 rounded-xl px-4 py-2.5 space-y-2 shadow-xl">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Camera Presets */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono text-slate-400 mr-1">Góc nhìn 3D:</span>
                    {(
                      [
                        { id: 'TACTICAL', label: 'Toàn Cảnh' },
                        { id: 'CHASE', label: 'Góc Đuổi' },
                        { id: 'INSPECT', label: 'Soi Cấu Tạo' },
                      ] as { id: ArenaCameraPreset; label: string }[]
                    ).map((cam) => (
                      <button
                        key={cam.id}
                        type="button"
                        onClick={() => handleCameraPresetChange(cam.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                          cameraPreset === cam.id
                            ? 'bg-emerald-500 text-slate-950 font-bold'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {cam.label}
                      </button>
                    ))}
                  </div>

                  {/* 3D Exploded-View / Structure Inspection Slider */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[11px] font-mono text-slate-300">
                      Bóc tách Модели 3D:
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={inspectionPct}
                      onChange={(e) => handleInspectionChange(Number(e.target.value))}
                      className="w-24 accent-emerald-400 cursor-pointer"
                    />
                    <span className="font-mono text-[11px] text-amber-400 w-9 tabular-nums">
                      {inspectionPct}%
                    </span>
                  </div>

                  {/* Synchronized 1-Click Learner Support Bridges */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        openSynchronizedSupport('ly_thuyet', targetLessonId, {
                          lessonId: targetLessonId,
                          domain: selectedSector.domain,
                        })
                      }
                      className="px-2.5 py-1 rounded-lg bg-[#0F2742] hover:bg-[#16375B] border border-sky-500/40 text-sky-300 text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      Bài Học ({targetLessonId})
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openSynchronizedSupport('cong_thuc', targetFormulaId, {
                          formulaId: targetFormulaId,
                          domain: selectedSector.domain,
                        })
                      }
                      className="px-2.5 py-1 rounded-lg bg-[#0F2742] hover:bg-[#16375B] border border-teal-500/40 text-teal-300 text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      Máy Tính Công Thức
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openSynchronizedSupport('bioscience_lab', targetProteinOrCompound)
                      }
                      className="px-2.5 py-1 rounded-lg bg-[#0F2742] hover:bg-[#16375B] border border-purple-500/40 text-purple-300 text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      Mô Hình Sinh-Hóa 3D
                    </button>
                    <button
                      type="button"
                      onClick={() => openSynchronizedSupport('loi_sai')}
                      className="px-2.5 py-1 rounded-lg bg-[#0F2742] hover:bg-[#16375B] border border-rose-500/40 text-rose-300 text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      Sổ Tay Lỗi Sai ({state.errorNotebook.filter((e) => !e.resolved).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDockCollapsed(true)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono cursor-pointer"
                      title="Thu gọn thanh điều khiển [H]"
                    >
                      ▾ Thu gọn [H]
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          4. PAUSE / VICTORY / GAME OVER MODAL
          ===================================================================== */}
      {(gameState === 'PAUSED' || gameState === 'VICTORY' || gameState === 'GAME_OVER') &&
        !showAcademyDeck && (
          <div className="fixed inset-0 z-30 bg-slate-950/80 flex items-center justify-center p-4">
            <div className="bg-[#0B192C] border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-5 text-slate-100 shadow-2xl">
              <div className="space-y-1">
                <div className="text-xs font-mono font-semibold text-emerald-400">
                  {selectedSector.code} · {selectedSector.bossName}
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-white">
                  {gameState === 'PAUSED'
                    ? 'Tạm Dừng Chiến Dịch 3D'
                    : gameState === 'VICTORY'
                    ? 'Chiến Thắng Tuyệt Đối!'
                    : 'Khiên Năng Lượng Quá Tải'}
                </h2>
                <p className="text-xs text-slate-300">
                  {gameState === 'PAUSED'
                    ? 'Em có thể tiếp tục chiến đấu, đổi khu vực KHTN 8 hoặc mở Bàn Học Đồng Bộ & Phòng Lab Phân Tử.'
                    : gameState === 'VICTORY'
                    ? `Xuất sắc! Em đã đánh bại ${selectedSector.bossName} và làm chủ kiến thức ${selectedSector.title}.`
                    : 'Đừng nản lòng! Hãy xem lại công thức trong Sổ tay lỗi sai hoặc hỏi Cố Vấn Tư Duy Sâu rồi thử lại nhé.'}
                </p>
              </div>

              {/* Numeric Stats Summary */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-xl bg-[#07111E] border border-slate-800">
                  <div className="text-[11px] text-slate-400">Điểm Đấu Trường</div>
                  <div className="font-mono font-bold text-lg text-white tabular-nums">
                    {gameState === 'PAUSED' ? hud.score : endSummary.finalScore}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#07111E] border border-slate-800">
                  <div className="text-[11px] text-slate-400">Đợt Cổng (Wave)</div>
                  <div className="font-mono font-bold text-lg text-amber-400 tabular-nums">
                    {gameState === 'PAUSED' ? hud.wave : endSummary.waveReached}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#07111E] border border-slate-800">
                  <div className="text-[11px] text-slate-400">Tổng XP Tích Lũy</div>
                  <div className="font-mono font-bold text-lg text-emerald-400 tabular-nums">
                    {state.totalXP} XP
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {gameState === 'PAUSED' ? (
                  <button
                    type="button"
                    onClick={handleTogglePause}
                    className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Tiếp Tục Chiến Đấu [Esc]
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStartGame()}
                    className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Chơi Lại Ngay [Enter]
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playButtonClick();
                    setGameState('TITLE_SCREEN');
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs cursor-pointer whitespace-nowrap shrink-0"
                >
                  Về Màn Hình Chính
                </button>

                <button
                  type="button"
                  onClick={() =>
                    openSynchronizedSupport('cong_thuc', targetFormulaId, {
                      formulaId: targetFormulaId,
                      domain: selectedSector.domain,
                    })
                  }
                  className="px-4 py-2.5 rounded-xl bg-[#0F2742] hover:bg-[#16375B] border border-sky-500/40 text-sky-300 font-semibold text-xs cursor-pointer whitespace-nowrap shrink-0"
                >
                  Mở Công Thức & Máy Tính ({targetFormulaId})
                </button>

                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playButtonClick();
                    openAiTutor(
                      `Hãy giúp em tổng hợp các công thức và mẹo tránh bẫy đơn vị của phần "${selectedSector.title}" trong KHTN 8.`
                    );
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[#0F2742] hover:bg-[#16375B] border border-emerald-500/40 text-emerald-300 font-semibold text-xs cursor-pointer whitespace-nowrap shrink-0"
                >
                  Hỏi Cố Vấn Tư Duy Sâu (AI)
                </button>
              </div>

              <button
                type="button"
                onClick={() => openSynchronizedSupport('game_world')}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-amber-300 cursor-pointer"
              >
                Mở Toàn Bộ Học Viện KHTN 8 v3.0 (Lý thuyết · Công thức · Thí nghiệm · Sổ tay lỗi sai)
              </button>
            </div>
          </div>
        )}

      {/* =====================================================================
          5. COMMAND DECK MODAL (All 19 KHTN 8 v3.0 Modules + Bioscience Lab)
          ===================================================================== */}
      {showAcademyDeck && (
        <div className="fixed inset-0 z-40 bg-[#f5f0e2] flex flex-col overflow-hidden select-text">
          {/* Compact Command Deck Top Bar */}
          <div className="bg-[#214f3d] text-white px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4 border-b border-[#376d55] shrink-0">
            <div className="flex items-center gap-3">
              <span className="font-bold text-sm sm:text-base tracking-tight whitespace-nowrap shrink-0">
                Học Viện Khoa Học Tự Nhiên 8 — Hệ Thống Học Tập Đồng Bộ
              </span>
              <span className="hidden md:inline text-xs text-emerald-200 font-mono tabular-nums">
                Cấp {levelInfo.level} · {state.totalXP} XP · Chuỗi {state.dailyStreak} ngày
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playButtonClick();
                  openAiTutor();
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
              >
                Cố Vấn Tư Duy Sâu (Thinking High)
              </button>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playButtonClick();
                  setShowAcademyDeck(false);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
              >
                ← Quay Lại Đấu Trường 3D WebGL
              </button>
            </div>
          </div>

          {/* Primary Module Navigation */}
          <PrimaryNav />

          {/* Active KHTN 8 Module View */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pt-6 max-w-7xl w-full mx-auto">
            {currentTab === 'home' && <HomeModule />}
            {currentTab === 'game_world' && <GameWorldModule />}
            {currentTab === 'bioscience_lab' && <BioscienceLabModule />}
            {currentTab === 'on_tap' && <OnTapModule />}
            {currentTab === 'ly_thuyet' && <LyThuyetModule />}
            {currentTab === 'cong_thuc' && <CongThucModule />}
            {currentTab === 'don_vi' && <DonViModule />}
            {currentTab === 'dang_bai' && <DangBaiModule />}
            {currentTab === 'bai_tap' && <BaiTapModule />}
            {currentTab === 'thi_nghiem' && <ThiNghiemModule />}
            {currentTab === 'thuc_tien' && <ThucTienModule />}
            {currentTab === 'lien_mon' && <LienMonModule />}
            {currentTab === 'xuat_ban' && <XuatBanModule />}
            {currentTab === 'game' && <GameModule />}
            {currentTab === 'tu_kiem_tra' && <TuKiemTraModule />}
            {currentTab === 'loi_sai' && <LoiSaiModule />}
            {currentTab === 'tra_cuu' && <TraCuuModule />}
            {currentTab === 'tien_do' && <TienDoModule />}
            {currentTab === 'teacher_dashboard' && <TeacherDashboardModule />}
          </div>
        </div>
      )}

      {/* =====================================================================
          6. HIGH-THINKING AI TUTOR MODAL (Gemini 4 Argon + ThinkingLevel.HIGH)
          ===================================================================== */}
      <ThinkingTutorModal
        isOpen={isAiTutorOpen}
        onClose={closeAiTutor}
        initialPrompt={aiTutorPrompt}
      />
    </div>
  );
};
