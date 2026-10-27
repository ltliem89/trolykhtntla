import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLearningState } from '../context/LearningStateContext';
import { useAppNavigation } from '../context/NavigationContext';
import { soundEngine } from '../utils/soundEngine';
import {
  Dna,
  FlaskConical,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sun,
  Moon,
  Award,
  Search,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  Layers
} from 'lucide-react';

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
  baseDelayMs = 600
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.ok) {
      return response;
    }
    if (
      (response.status === 429 || response.status >= 500) &&
      attempt < maxRetries
    ) {
      const retryAfter = Number(response.headers.get('Retry-After'));
      const delay =
        !Number.isNaN(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `HTTP ${response.status} (${response.statusText}) from ${url}: ${errorBody.slice(0, 200)}`
    );
  }
  throw new Error(`Exhausted retries for ${url}`);
}

interface ProteinQuickExample {
  uniprotId: string;
  pdbId: string;
  gene: string;
  nameVi: string;
  khtn8Connection: string;
  quizQuestion: string;
  quizOptions: string[];
  quizCorrectIdx: number;
}

interface CompoundQuickExample {
  queryName: string;
  defaultCid: number;
  nameVi: string;
  formulaText: string;
  khtn8Connection: string;
  quizQuestion: string;
  quizOptions: string[];
  quizCorrectIdx: number;
}

const PROTEIN_EXAMPLES: ProteinQuickExample[] = [
  {
    uniprotId: 'P69905',
    pdbId: '4HHB',
    gene: 'HBA1',
    nameVi: 'Hemoglobin (Huyết sắc tố hồng cầu)',
    khtn8Connection:
      'Sinh học 8 (Máu & Hệ tuần hoàn): Gắn kết thuận nghịch với O₂ ở phổi (Hb + O₂ ⇌ HbO₂) để vận chuyển oxygen đến từng tế bào.',
    quizQuestion: 'Nguyên tố kim loại nào nằm ở tâm nhóm Heme của Hemoglobin giúp gắn phân tử O₂?',
    quizOptions: ['Iron (Sắt - Fe²⁺)', 'Calcium (Ca²⁺)', 'Sodium (Na⁺)', 'Magnesium (Mg²⁺)'],
    quizCorrectIdx: 0,
  },
  {
    uniprotId: 'P01308',
    pdbId: '4INS',
    gene: 'INS',
    nameVi: 'Hormone Insulin (Điều hòa đường huyết)',
    khtn8Connection:
      'Sinh học 8 (Cân bằng nội môi & Tuyến nội tiết): Do tế bào beta đảo tụy tiết ra khi nồng độ glucose máu tăng cao, chuyển glucose thành glycogen dự trữ.',
    quizQuestion: 'Khi nồng độ đường glucose trong máu tăng sau bữa ăn, Insulin tác động như thế nào?',
    quizOptions: [
      'Kích thích tế bào nhận glucose và chuyển glucose thành glycogen ở gan, hạ đường huyết về mức ổn định',
      'Phân giải glycogen thành glucose làm tăng đường huyết',
      'Làm tăng áp suất thẩm thấu trong dạ dày',
      'Biến đổi tinh bột thành maltose ở khoang miệng',
    ],
    quizCorrectIdx: 0,
  },
  {
    uniprotId: 'P04746',
    pdbId: '1HNY',
    gene: 'AMY1A',
    nameVi: 'Enzyme Alpha-Amylase (Nước bọt)',
    khtn8Connection:
      'Sinh học 8 (Hệ tiêu hóa): Xúc tác phân giải tinh bột chín thành đường đôi maltose ngay tại khoang miệng (hoạt động tối ưu ở 37 °C, pH ≈ 7,2).',
    quizQuestion: 'Vì sao khi nhai kĩ cơm trắng trong miệng ta lại cảm thấy vị ngọt?',
    quizOptions: [
      'Enzyme Amylase biến đổi một phần tinh bột chín thành đường maltose',
      'Enzyme Pepsin phân giải protein trong gạo thành đường',
      'HCl trong miệng hòa tan muối khoáng',
      'Nhiệt độ làm tinh bột tự cháy thành đường',
    ],
    quizCorrectIdx: 0,
  },
  {
    uniprotId: 'P00790',
    pdbId: '4PEP',
    gene: 'PGA3',
    nameVi: 'Enzyme Pepsin A (Dịch vị dạ dày)',
    khtn8Connection:
      'Sinh học & Hóa học 8 (pH và Enzyme tiêu hóa): Hoạt động mạnh trong môi trường acid mạnh của dạ dày (pH ≈ 1,5 – 2,5 do HCl tạo ra) để cắt chuỗi protein.',
    quizQuestion: 'Enzyme Pepsin ở dạ dày hoạt động hiệu quả nhất trong môi trường nào?',
    quizOptions: [
      'Môi trường acid mạnh (pH ≈ 1,5 - 2,5 có mặt HCl)',
      'Môi trường kiềm mạnh (pH > 10)',
      'Môi trường nước cất trung tính (pH = 7,0)',
      'Ở nhiệt độ sôi 100 °C',
    ],
    quizCorrectIdx: 0,
  },
  {
    uniprotId: 'P04040',
    pdbId: '1DGF',
    gene: 'CAT',
    nameVi: 'Enzyme Catalase (Phân giải H₂O₂)',
    khtn8Connection:
      'Hóa học & Sinh học 8 (Chất xúc tác phản ứng): Phân giải cực nhanh chất độc hydrogen peroxide (2H₂O₂ → 2H₂O + O₂↑) bảo vệ tế bào.',
    quizQuestion: 'Vai trò của chất xúc tác (như enzyme Catalase hoặc MnO₂) trong phản ứng phân hủy H₂O₂ là gì?',
    quizOptions: [
      'Làm tăng tốc độ phản ứng nhưng không bị tiêu hao sau phản ứng',
      'Làm tăng khối lượng khí O₂ thu được gấp đôi so với lý thuyết',
      'Biến nước thành khí hydrogen',
      'Làm giảm nhiệt độ sôi của dung dịch',
    ],
    quizCorrectIdx: 0,
  },
];

const COMPOUND_EXAMPLES: CompoundQuickExample[] = [
  {
    queryName: 'glucose',
    defaultCid: 5793,
    nameVi: 'Glucose (Đường nho)',
    formulaText: 'C₆H₁₂O₆ (M = 180 g/mol)',
    khtn8Connection:
      'Hóa học & Sinh học 8: Nguồn nguyên liệu chính cho hô hấp tế bào (C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + ATP). Dùng pha dịch truyền y tế.',
    quizQuestion: 'Khối lượng mol phân tử (M) của Glucose (C₆H₁₂O₆) là bao nhiêu? (Biết C=12, H=1, O=16)',
    quizOptions: ['180 g/mol', '342 g/mol', '120 g/mol', '90 g/mol'],
    quizCorrectIdx: 0,
  },
  {
    queryName: 'sodium bicarbonate',
    defaultCid: 516892,
    nameVi: 'Sodium Bicarbonate (Thuốc muối NaHCO₃)',
    formulaText: 'NaHCO₃ (M = 84 g/mol)',
    khtn8Connection:
      'Hóa học 8 (Muối & Phản ứng trao đổi): Dùng trung hòa bớt acid HCl dư thừa trong dịch vị dạ dày: NaHCO₃ + HCl → NaCl + CO₂↑ + H₂O.',
    quizQuestion: 'Khi cho NaHCO₃ tác dụng với dung dịch acid HCl trong dạ dày, khí nào thoát ra?',
    quizOptions: ['Khí Carbon dioxide (CO₂)', 'Khí Hydrogen (H₂)', 'Khí Oxygen (O₂)', 'Khí Chlorine (Cl₂)'],
    quizCorrectIdx: 0,
  },
  {
    queryName: 'aspirin',
    defaultCid: 2244,
    nameVi: 'Aspirin (Acetylsalicylic acid)',
    formulaText: 'C₉H₈O₄ (M = 180,16 g/mol)',
    khtn8Connection:
      'Hóa học & Y sinh: Thuốc giảm đau, hạ sốt kinh điển được tổng hợp hóa học, minh họa quy tắc 5 Lipinski về độ hấp thụ thuốc qua đường uống.',
    quizQuestion: 'Theo Quy tắc 5 của Lipinski (Lipinski Rule of Five), một phân tử thuốc hấp thụ tốt qua đường uống thường có khối lượng phân tử:',
    quizOptions: ['Nhỏ hơn hoặc bằng 500 Da (g/mol)', 'Lớn hơn 5000 Da', 'Bắt buộc bằng 0', 'Chỉ chứa nguyên tố kim loại'],
    quizCorrectIdx: 0,
  },
  {
    queryName: 'ascorbic acid',
    defaultCid: 54670067,
    nameVi: 'Vitamin C (Ascorbic Acid)',
    formulaText: 'C₆H₈O₆ (M = 176,12 g/mol)',
    khtn8Connection:
      'Sinh học 8 (Dinh dưỡng & Vitamin): Tan tốt trong nước, tăng sức đề kháng, hỗ trợ hấp thụ sắt (Fe) tạo hồng cầu và tổng hợp collagen.',
    quizQuestion: 'Vitamin C có nhiều nhóm phân cực (-OH) nên có tính chất vật lí nổi bật nào?',
    quizOptions: [
      'Tan tốt trong nước, cần bổ sung hằng ngày qua rau quả tươi',
      'Không tan trong nước, chỉ tan trong dầu mỡ',
      'Là chất khí ở điều kiện thường',
      'Dẫn điện mạnh như kim loại đồng',
    ],
    quizCorrectIdx: 0,
  },
];

interface ResidueCoord {
  resSeq: number;
  resName: string;
  x: number;
  y: number;
  z: number;
  plddt: number;
}

interface UniProtFeature {
  type: string;
  description: string;
  start: number;
  end: number;
}

interface PubChemCompoundData {
  cid: number;
  molecularFormula: string;
  molecularWeight: number;
  canonicalSmiles: string;
  inchikey: string;
  xlogp: number;
  tpsa: number;
  hBondDonor: number;
  hBondAcceptor: number;
  rotatableBonds: number;
  complexity: number;
}

function getPlddtColor(score: number): string {
  if (score > 90) return '#0053D6'; // Very High (>90) Deep Blue
  if (score >= 70) return '#65CBF3'; // Confident (70-90) Light Blue
  if (score >= 50) return '#FFDB13'; // Low (50-70) Yellow
  return '#FF7D45'; // Very Low (<50) Orange
}

export const BioscienceLabModule: React.FC = () => {
  const { recordLearningEvent, unlockScienceCard } = useLearningState();
  const { currentItemId, openAiTutor, launchArenaSector } = useAppNavigation();

  const [labMode, setLabMode] = useState<'PROTEIN' | 'CHEMISTRY'>('PROTEIN');

  // Protein state
  const [selectedProtein, setSelectedProtein] = useState<ProteinQuickExample>(PROTEIN_EXAMPLES[0]);
  const [customAccession, setCustomAccession] = useState('');
  const [proteinLoading, setProteinLoading] = useState(false);
  const [proteinError, setProteinError] = useState<string | null>(null);
  const [afMetadata, setAfMetadata] = useState<any | null>(null);
  const [pdbMetadata, setPdbMetadata] = useState<any | null>(null);
  const [uniprotFeatures, setUniprotFeatures] = useState<UniProtFeature[]>([]);
  const [residues, setResidues] = useState<ResidueCoord[]>([]);
  const [highlightedRange, setHighlightedRange] = useState<{ start: number; end: number; label: string } | null>(null);

  // 3D Viewer Controls
  const [zoom, setZoom] = useState<number>(1.0);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [darkCanvas, setDarkCanvas] = useState<boolean>(true);
  const rotationRef = useRef({ rotX: 0.35, rotY: 0.6 });
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({
    dragging: false,
    lastX: 0,
    lastY: 0,
  });
  const canvas3dRef = useRef<HTMLCanvasElement | null>(null);

  // Chemistry state
  const [selectedCompound, setSelectedCompound] = useState<CompoundQuickExample>(COMPOUND_EXAMPLES[0]);
  const [customCompoundQuery, setCustomCompoundQuery] = useState('');
  const [chemLoading, setChemLoading] = useState(false);
  const [chemError, setChemError] = useState<string | null>(null);
  const [chemData, setChemData] = useState<PubChemCompoundData | null>(null);
  const [chemImageError, setChemImageError] = useState(false);

  // Gamified Quiz Verification State
  const [quizChoice, setQuizChoice] = useState<number | null>(null);
  const [quizCompletedIds, setQuizCompletedIds] = useState<string[]>([]);

  // Parse PDB C-alpha coordinates for interactive 3D rendering
  const parsePdbCoordinates = (pdbText: string): ResidueCoord[] => {
    const lines = pdbText.split('\n');
    const coords: ResidueCoord[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('ATOM  ') && line.substring(12, 16).trim() === 'CA') {
        const resName = line.substring(17, 20).trim();
        const resSeq = parseInt(line.substring(22, 26).trim(), 10);
        const x = parseFloat(line.substring(30, 38).trim());
        const y = parseFloat(line.substring(38, 46).trim());
        const z = parseFloat(line.substring(46, 54).trim());
        const bFactor = parseFloat(line.substring(60, 66).trim());
        if (!Number.isNaN(x) && !Number.isNaN(y) && !Number.isNaN(z)) {
          coords.push({
            resSeq: Number.isNaN(resSeq) ? coords.length + 1 : resSeq,
            resName,
            x,
            y,
            z,
            plddt: Number.isNaN(bFactor) ? 88 : bFactor,
          });
        }
      }
    }
    // Center coordinates at origin
    if (coords.length > 0) {
      let cx = 0,
        cy = 0,
        cz = 0;
      coords.forEach((c) => {
        cx += c.x;
        cy += c.y;
        cz += c.z;
      });
      cx /= coords.length;
      cy /= coords.length;
      cz /= coords.length;
      coords.forEach((c) => {
        c.x -= cx;
        c.y -= cy;
        c.z -= cz;
      });
    }
    return coords;
  };

  // Load AlphaFold DB + UniProtKB + RCSB PDB data
  const loadProteinData = async (example: ProteinQuickExample) => {
    setProteinLoading(true);
    setProteinError(null);
    setHighlightedRange(null);
    setQuizChoice(null);

    try {
      const [afRes, uniprotRes, pdbRes] = await Promise.allSettled([
        fetchWithRetry(`https://alphafold.ebi.ac.uk/api/prediction/${example.uniprotId}`),
        fetchWithRetry(`https://rest.uniprot.org/uniprotkb/${example.uniprotId}.json`),
        fetchWithRetry(`https://data.rcsb.org/rest/v1/core/entry/${example.pdbId.toLowerCase()}`),
      ]);

      let afEntry: any = null;
      if (afRes.status === 'fulfilled') {
        const afJson = await afRes.value.json();
        afEntry = Array.isArray(afJson) ? afJson[0] : afJson;
        setAfMetadata(afEntry);
      } else {
        setAfMetadata(null);
      }

      if (pdbRes.status === 'fulfilled') {
        setPdbMetadata(await pdbRes.value.json());
      } else {
        setPdbMetadata(null);
      }

      if (uniprotRes.status === 'fulfilled') {
        const upJson = await uniprotRes.value.json();
        const feats: UniProtFeature[] = (upJson.features || [])
          .filter((f: any) =>
            ['Domain', 'Active site', 'Binding site', 'Region', 'Chain'].includes(f.type)
          )
          .slice(0, 8)
          .map((f: any) => ({
            type: f.type,
            description: f.description || f.type,
            start: f.location?.start?.value || 1,
            end: f.location?.end?.value || 50,
          }));
        setUniprotFeatures(feats);
      } else {
        setUniprotFeatures([]);
      }

      // Fetch real 3D coordinates from AlphaFold pdbUrl (resolved dynamically) or RCSB PDB
      let loadedCoords: ResidueCoord[] = [];
      const pdbUrl = afEntry?.pdbUrl || `https://files.rcsb.org/download/${example.pdbId}.pdb`;
      try {
        const coordRes = await fetchWithRetry(pdbUrl);
        const pdbText = await coordRes.text();
        loadedCoords = parsePdbCoordinates(pdbText);
      } catch {
        // Fallback parametric alpha-helix if network blocks coordinate file download
        loadedCoords = Array.from({ length: 140 }, (_, idx) => {
          const t = idx * 0.28;
          return {
            resSeq: idx + 1,
            resName: ['ALA', 'GLY', 'LEU', 'HIS', 'LYS', 'GLU'][idx % 6],
            x: Math.cos(t) * 14 + Math.sin(idx * 0.06) * 8,
            y: (idx - 70) * 0.42,
            z: Math.sin(t) * 14 + Math.cos(idx * 0.06) * 8,
            plddt: idx > 15 && idx < 125 ? 93 : 76,
          };
        });
      }
      setResidues(loadedCoords);
    } catch (err: any) {
      setProteinError(err?.message || 'Không thể tải dữ liệu cấu trúc protein.');
    } finally {
      setProteinLoading(false);
    }
  };

  // Load PubChem compound data
  const loadCompoundData = async (example: CompoundQuickExample) => {
    setChemLoading(true);
    setChemError(null);
    setChemImageError(false);
    setQuizChoice(null);

    try {
      let cid = example.defaultCid;
      try {
        const cidRes = await fetchWithRetry(
          `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(example.queryName)}/cids/JSON`
        );
        const cidJson = await cidRes.json();
        if (cidJson?.IdentifierList?.CID?.[0]) {
          cid = cidJson.IdentifierList.CID[0];
        }
      } catch {
        // use defaultCid
      }

      const propUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/MolecularFormula,MolecularWeight,CanonicalSMILES,InChIKey,XLogP,TPSA,HBondDonorCount,HBondAcceptorCount,RotatableBondCount,Complexity/JSON`;
      const propRes = await fetchWithRetry(propUrl);
      const propJson = await propRes.json();
      const p = propJson?.PropertyTable?.Properties?.[0];
      if (!p) throw new Error('Không tìm thấy thuộc tính hóa lý trên PubChem.');

      setChemData({
        cid: p.CID || cid,
        molecularFormula: p.MolecularFormula || '',
        molecularWeight: parseFloat(p.MolecularWeight) || 0,
        canonicalSmiles: p.CanonicalSMILES || p.ConnectivitySMILES || '',
        inchikey: p.InChIKey || '',
        xlogp: typeof p.XLogP === 'number' ? p.XLogP : 0,
        tpsa: typeof p.TPSA === 'number' ? p.TPSA : 0,
        hBondDonor: p.HBondDonorCount ?? 0,
        hBondAcceptor: p.HBondAcceptorCount ?? 0,
        rotatableBonds: p.RotatableBondCount ?? 0,
        complexity: p.Complexity ?? 0,
      });
    } catch (err: any) {
      setChemError(err?.message || 'Không thể truy vấn cơ sở dữ liệu PubChem.');
    } finally {
      setChemLoading(false);
    }
  };

  // Synchronized Deep-Link: Switch to target Protein or Compound when navigated from Arena or Modules
  useEffect(() => {
    if (!currentItemId) return;
    const matchedProtein = PROTEIN_EXAMPLES.find(
      (p) => p.uniprotId.toLowerCase() === currentItemId.toLowerCase()
    );
    if (matchedProtein) {
      setLabMode('PROTEIN');
      setSelectedProtein(matchedProtein);
      return;
    }
    const matchedCompound = COMPOUND_EXAMPLES.find(
      (c) => c.queryName.toLowerCase() === currentItemId.toLowerCase()
    );
    if (matchedCompound) {
      setLabMode('CHEMISTRY');
      setSelectedCompound(matchedCompound);
    }
  }, [currentItemId]);

  useEffect(() => {
    loadProteinData(selectedProtein);
  }, [selectedProtein]);

  useEffect(() => {
    if (labMode === 'CHEMISTRY') {
      loadCompoundData(selectedCompound);
    }
  }, [labMode, selectedCompound]);

  // Interactive 3D Protein Backbone & Active Site Canvas Renderer
  useEffect(() => {
    if (labMode !== 'PROTEIN') return;
    const canvas = canvas3dRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const render3D = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Background
      ctx.fillStyle = darkCanvas ? '#0F172A' : '#F8FAFC';
      ctx.fillRect(0, 0, width, height);

      // Subtle grid
      ctx.strokeStyle = darkCanvas ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.06)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      if (autoRotate && !dragRef.current.dragging) {
        rotationRef.current.rotY += 0.008;
      }

      if (residues.length > 0) {
        const { rotX, rotY } = rotationRef.current;
        const cosY = Math.cos(rotY);
        const sinY = Math.sin(rotY);
        const cosX = Math.cos(rotX);
        const sinX = Math.sin(rotX);

        const scale = 6.2 * zoom;
        const projected = residues.map((r) => {
          // Rotate Y then X
          const x1 = r.x * cosY - r.z * sinY;
          const z1 = r.x * sinY + r.z * cosY;
          const y2 = r.y * cosX - z1 * sinX;
          const z2 = r.y * sinX + z1 * cosX;

          const perspective = 260 / (260 + z2);
          return {
            ...r,
            sx: width * 0.5 + x1 * scale * perspective,
            sy: height * 0.5 + y2 * scale * perspective,
            sz: z2,
            pScale: perspective,
          };
        });

        // Draw peptide backbone bonds
        ctx.lineWidth = 2.4 * zoom;
        for (let i = 0; i < projected.length - 1; i++) {
          const a = projected[i];
          const b = projected[i + 1];
          // Skip bond if chain break
          if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 6.5) continue;

          const isHighlighted =
            highlightedRange &&
            a.resSeq >= highlightedRange.start &&
            a.resSeq <= highlightedRange.end;

          ctx.strokeStyle = isHighlighted ? '#10B981' : getPlddtColor(a.plddt);
          ctx.globalAlpha = highlightedRange && !isHighlighted ? 0.25 : 0.9;
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(b.sx, b.sy);
          ctx.stroke();
        }

        // Sort atoms back-to-front for depth accuracy
        const sorted = [...projected].sort((a, b) => b.sz - a.sz);
        for (let i = 0; i < sorted.length; i++) {
          const pt = sorted[i];
          const isHighlighted =
            highlightedRange &&
            pt.resSeq >= highlightedRange.start &&
            pt.resSeq <= highlightedRange.end;

          ctx.globalAlpha = highlightedRange && !isHighlighted ? 0.22 : 1;
          ctx.fillStyle = isHighlighted ? '#10B981' : getPlddtColor(pt.plddt);
          const rad = Math.max(2, (isHighlighted ? 5.2 : 3.2) * pt.pScale * zoom);

          ctx.beginPath();
          ctx.arc(pt.sx, pt.sy, rad, 0, Math.PI * 2);
          ctx.fill();

          if (isHighlighted) {
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }

      rafId = requestAnimationFrame(render3D);
    };

    rafId = requestAnimationFrame(render3D);
    return () => cancelAnimationFrame(rafId);
  }, [labMode, residues, zoom, autoRotate, darkCanvas, highlightedRange]);

  // Lipinski Rule of Five & Veber evaluation
  const drugLikeness = useMemo(() => {
    if (!chemData) return null;
    const checks = [
      { label: 'Khối lượng phân tử (MW ≤ 500 Da)', pass: chemData.molecularWeight <= 500, val: `${chemData.molecularWeight} Da` },
      { label: 'Hệ số phân bố (XLogP ≤ 5)', pass: chemData.xlogp <= 5, val: `${chemData.xlogp}` },
      { label: 'Liên kết H cho (HBD ≤ 5)', pass: chemData.hBondDonor <= 5, val: `${chemData.hBondDonor}` },
      { label: 'Liên kết H nhận (HBA ≤ 10)', pass: chemData.hBondAcceptor <= 10, val: `${chemData.hBondAcceptor}` },
      { label: 'Diện tích bề mặt phân cực (TPSA ≤ 140 Å²)', pass: chemData.tpsa <= 140, val: `${chemData.tpsa} Å²` },
      { label: 'Liên kết đơn quay được (≤ 10)', pass: chemData.rotatableBonds <= 10, val: `${chemData.rotatableBonds}` },
    ];
    const violations = checks.slice(0, 4).filter((c) => !c.pass).length;
    return { checks, violations, bioavailable: violations <= 1 };
  }, [chemData]);

  const currentQuizId = labMode === 'PROTEIN' ? selectedProtein.uniprotId : selectedCompound.queryName;
  const currentQuiz = labMode === 'PROTEIN' ? selectedProtein : selectedCompound;
  const isQuizSolved = quizCompletedIds.includes(currentQuizId);

  const handleAnswerLabQuiz = (idx: number) => {
    setQuizChoice(idx);
    if (idx === currentQuiz.quizCorrectIdx) {
      soundEngine.playAnswerCorrect(2);
      if (!isQuizSolved) {
        setQuizCompletedIds((prev) => [...prev, currentQuizId]);
        recordLearningEvent(
          'CHALLENGE_PASSED',
          `Hoàn thành phân tích Sinh-Hóa phân tử: ${currentQuiz.nameVi} (+45 XP)`,
          { scoreDelta: 45 }
        );
        unlockScienceCard('KN_HOA_01');
      }
    } else {
      soundEngine.playAnswerWrong();
    }
  };

  return (
    <div className="space-y-6 pb-12 text-slate-900">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Phòng Thí Nghiệm Phân Tử & Sinh Học KHTN 8</span>
            <span aria-hidden="true">·</span>
            <span>AlphaFold DB · RCSB PDB · UniProtKB · PubChem</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Bàn Làm Việc Khoa Học Phân Tử & Protein Thực Tế
          </h1>
          <p className="text-xs text-slate-600 max-w-3xl">
            Khám phá cấu trúc không gian 3D của các enzyme tiêu hóa, hormone điều hòa nội môi, huyết sắc tố Hemoglobin và các hợp chất hóa học lớp 8 từ cơ sở dữ liệu quốc tế.
          </p>
        </div>

        {/* Mode Switcher & Synchronized Bridges */}
        <div className="flex flex-wrap items-center gap-2 self-start">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => {
                soundEngine.playButtonClick();
                setLabMode('PROTEIN');
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                labMode === 'PROTEIN'
                  ? 'bg-[#1A73E8] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Dna className="w-4 h-4" />
              <span>Cấu Trúc Protein 3D (Sinh Học 8)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playButtonClick();
                setLabMode('CHEMISTRY');
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                labMode === 'CHEMISTRY'
                  ? 'bg-[#0D9488] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FlaskConical className="w-4 h-4" />
              <span>Hợp Chất Hóa Học (PubChem)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              openAiTutor(
                labMode === 'PROTEIN'
                  ? `Hãy phân tích mối liên hệ giữa cấu trúc không gian 3D của "${selectedProtein.nameVi}" (${selectedProtein.uniprotId}) với chức năng sinh học trong chương trình KHTN 8: ${selectedProtein.khtn8Connection}`
                  : `Hãy giải thích tính chất hóa học và ứng dụng thực tiễn của hợp chất "${selectedCompound.nameVi}" (${selectedCompound.formulaText}) trong chương trình KHTN 8: ${selectedCompound.khtn8Connection}`
              )
            }
            className="px-3 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            Hỏi Cố Vấn AI (Thinking High)
          </button>

          <button
            type="button"
            onClick={() =>
              launchArenaSector(labMode === 'PROTEIN' ? 'SECTOR_SINH' : 'SECTOR_HOA')
            }
            className="px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 text-xs font-bold cursor-pointer whitespace-nowrap"
          >
            Thực Chiến Đấu Trường 3D
          </button>
        </div>
      </div>

      {/* Top Quick-Try Example Selector Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-700">
            {labMode === 'PROTEIN'
              ? 'Chọn nhanh Protein & Enzyme trong chương trình Sinh học 8:'
              : 'Chọn nhanh Hợp chất trong chương trình Hóa học & Sinh học 8:'}
          </span>

          {/* Custom Accession / Compound Lookup */}
          {labMode === 'PROTEIN' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = customAccession.trim().toUpperCase();
                if (!trimmed) return;
                setSelectedProtein({
                  uniprotId: trimmed,
                  pdbId: '4HHB',
                  gene: trimmed,
                  nameVi: `Protein UniProt ${trimmed}`,
                  khtn8Connection: 'Tra cứu trực tiếp từ cơ sở dữ liệu AlphaFold DB & UniProtKB.',
                  quizQuestion: 'Dữ liệu pLDDT > 90 trên AlphaFold biểu thị mức độ tin cậy nào?',
                  quizOptions: ['Độ tin cậy rất cao (>90)', 'Độ tin cậy rất thấp (<50)', 'Không có cấu trúc', 'Lỗi phép đo'],
                  quizCorrectIdx: 0,
                });
              }}
              className="flex items-center gap-1.5"
            >
              <input
                type="text"
                value={customAccession}
                onChange={(e) => setCustomAccession(e.target.value)}
                placeholder="Mã UniProt (VD: P04637)..."
                className="px-2.5 py-1 text-xs font-mono border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
              />
              <button
                type="submit"
                className="px-3 py-1 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
              >
                Tra cứu
              </button>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = customCompoundQuery.trim();
                if (!trimmed) return;
                setSelectedCompound({
                  queryName: trimmed,
                  defaultCid: 2244,
                  nameVi: `Hợp chất: ${trimmed}`,
                  formulaText: 'Tra cứu trực tiếp PubChem',
                  khtn8Connection: 'Phân tích tính chất hóa lý trực tiếp từ PubChem PUG REST API.',
                  quizQuestion: 'Đơn vị của Khối lượng mol phân tử (M) trong Hóa học 8 là gì?',
                  quizOptions: ['g/mol (hoặc amu)', 'Newton (N)', 'Pascal (Pa)', 'Joule (J)'],
                  quizCorrectIdx: 0,
                });
              }}
              className="flex items-center gap-1.5"
            >
              <input
                type="text"
                value={customCompoundQuery}
                onChange={(e) => setCustomCompoundQuery(e.target.value)}
                placeholder="Tên chất tiếng Anh (VD: caffeine)..."
                className="px-2.5 py-1 text-xs font-mono border border-slate-300 rounded-md focus:outline-none focus:border-teal-600"
              />
              <button
                type="submit"
                className="px-3 py-1 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
              >
                Tra cứu
              </button>
            </form>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {labMode === 'PROTEIN'
            ? PROTEIN_EXAMPLES.map((item) => {
                const active = selectedProtein.uniprotId === item.uniprotId;
                return (
                  <button
                    key={item.uniprotId}
                    type="button"
                    onClick={() => {
                      soundEngine.playButtonClick();
                      setSelectedProtein(item);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-[#1A73E8] text-white border-[#1A73E8]'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="font-mono font-semibold">{item.uniprotId}</span> · {item.nameVi}
                  </button>
                );
              })
            : COMPOUND_EXAMPLES.map((item) => {
                const active = selectedCompound.queryName === item.queryName;
                return (
                  <button
                    key={item.queryName}
                    type="button"
                    onClick={() => {
                      soundEngine.playButtonClick();
                      setSelectedCompound(item);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-[#0D9488] text-white border-[#0D9488]'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {item.nameVi} · <span className="font-mono">{item.formulaText.split(' ')[0]}</span>
                  </button>
                );
              })}
        </div>
      </div>

      {/* Main Split Workbench: Left Interactive Canvas (60%) + Right Synchronized Inspector (40%) */}
      {labMode === 'PROTEIN' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left: Interactive 3D Molecular Structure Viewport */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-[#1A73E8]">{selectedProtein.uniprotId}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">PDB: {selectedProtein.pdbId}</span>
                  <span aria-hidden="true">·</span>
                  <span>[Predicted by model · AlphaFold DB]</span>
                </div>
                <h2 className="text-base font-bold text-slate-900 mt-0.5">{selectedProtein.nameVi}</h2>
              </div>

              {/* Explicit Viewport Controls (Wheel Zoom Suppressed) */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(2.2, +(z + 0.2).toFixed(1)))}
                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md cursor-pointer"
                  title="Phóng to (Zoom In)"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.2).toFixed(1)))}
                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md cursor-pointer"
                  title="Thu nhỏ (Zoom Out)"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1.0);
                    rotationRef.current = { rotX: 0.35, rotY: 0.6 };
                    setHighlightedRange(null);
                  }}
                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md cursor-pointer"
                  title="Đặt lại góc nhìn (Reset)"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setAutoRotate((r) => !r)}
                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md cursor-pointer"
                  title={autoRotate ? 'Tạm dừng xoay' : 'Tự động xoay'}
                >
                  {autoRotate ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setDarkCanvas((d) => !d)}
                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md cursor-pointer"
                  title="Đổi nền Sáng / Tối"
                >
                  {darkCanvas ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* 3D Canvas Container */}
            <div className="relative rounded-lg overflow-hidden border border-slate-200 h-[360px]">
              <canvas
                ref={canvas3dRef}
                width={680}
                height={360}
                onMouseDown={(e) => {
                  dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
                }}
                onMouseMove={(e) => {
                  if (!dragRef.current.dragging) return;
                  const dx = e.clientX - dragRef.current.lastX;
                  const dy = e.clientY - dragRef.current.lastY;
                  dragRef.current.lastX = e.clientX;
                  dragRef.current.lastY = e.clientY;
                  rotationRef.current.rotY += dx * 0.01;
                  rotationRef.current.rotX += dy * 0.01;
                }}
                onMouseUp={() => {
                  dragRef.current.dragging = false;
                }}
                onMouseLeave={() => {
                  dragRef.current.dragging = false;
                }}
                className="w-full h-full cursor-grab active:cursor-grabbing block"
              />
              {proteinLoading && (
                <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center text-white text-xs font-medium">
                  Đang tải tọa độ 3D từ AlphaFold DB & UniProtKB...
                </div>
              )}
              {highlightedRange && (
                <div className="absolute top-3 left-3 bg-slate-900/90 text-white px-3 py-1.5 rounded-md text-xs font-mono border border-emerald-500/50">
                  Đang tô sáng: {highlightedRange.label} (Aa {highlightedRange.start}–{highlightedRange.end})
                </div>
              )}
              <div className="absolute bottom-2.5 right-3 text-[11px] font-mono text-slate-400 pointer-events-none">
                Kéo chuột để xoay 3D · Số lượng Cα: {residues.length}
              </div>
            </div>

            {/* Canonical 4-Band AlphaFold pLDDT Confidence Scale Legend */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-700">Thang độ tin cậy AlphaFold pLDDT:</span>
              <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs inline-block" style={{ backgroundColor: '#0053D6' }} />
                  <span>Rất cao (&gt;90)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs inline-block" style={{ backgroundColor: '#65CBF3' }} />
                  <span>Tin cậy (70–90)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs inline-block" style={{ backgroundColor: '#FFDB13' }} />
                  <span>Thấp (50–70)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs inline-block" style={{ backgroundColor: '#FF7D45' }} />
                  <span>Rất thấp (&lt;50)</span>
                </span>
              </div>
            </div>
          </div>

          {/* Right: Synchronized Data Inspector & KHTN 8 Link */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div>
                <div className="text-xs text-slate-500 flex items-center gap-2">
                  <span>Liên hệ Chương trình KHTN 8</span>
                  <span aria-hidden="true">·</span>
                  <span>[Literature curated · UniProtKB]</span>
                </div>
                <p className="text-sm text-slate-800 font-medium mt-1 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200">
                  {selectedProtein.khtn8Connection}
                </p>
              </div>

              {proteinError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {proteinError}
                </div>
              )}

              {/* Metadata Summary Table */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-slate-500">Mã ген / UniProt</div>
                  <div className="font-mono font-bold text-slate-900 mt-0.5 tabular-nums">
                    {afMetadata?.gene || selectedProtein.gene} · {selectedProtein.uniprotId}
                  </div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-slate-500">Thực nghiệm RCSB PDB</div>
                  <div className="font-mono font-bold text-slate-900 mt-0.5 tabular-nums">
                    {selectedProtein.pdbId} ({pdbMetadata?.rcsb_entry_info?.experimental_method?.[0] || 'X-RAY'})
                  </div>
                </div>
              </div>

              {/* Synchronized Domain & Active Site Inspector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-[#1A73E8]" />
                    <span>Vùng chức năng & Tâm hoạt động (Bấm để tô sáng 3D)</span>
                  </span>
                  {highlightedRange && (
                    <button
                      type="button"
                      onClick={() => setHighlightedRange(null)}
                      className="text-[#1A73E8] hover:underline text-[11px] cursor-pointer"
                    >
                      Bỏ chọn
                    </button>
                  )}
                </div>
                <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                  {uniprotFeatures.length > 0 ? (
                    uniprotFeatures.map((feat, idx) => {
                      const isSel =
                        highlightedRange?.start === feat.start && highlightedRange?.end === feat.end;
                      return (
                        <button
                          key={`${feat.type}-${feat.start}-${idx}`}
                          type="button"
                          onClick={() => {
                            soundEngine.playButtonClick();
                            setHighlightedRange({
                              start: feat.start,
                              end: feat.end,
                              label: `${feat.type}: ${feat.description}`,
                            });
                          }}
                          className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors flex items-center justify-between cursor-pointer ${
                            isSel
                              ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-semibold'
                              : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                          }`}
                        >
                          <span className="truncate pr-2">
                            <span className="font-semibold">{feat.type}:</span> {feat.description}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500 shrink-0 tabular-nums">
                            Aa {feat.start}–{feat.end}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="text-xs text-slate-500 py-2">
                      Đang hiển thị toàn bộ chuỗi polypeptide ({residues.length} amino acid).
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Outbound Authoritative Provenance Citations */}
            <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-500">Nguồn xác thực:</span>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={`https://alphafold.ebi.ac.uk/entry/${selectedProtein.uniprotId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#1A73E8] hover:underline flex items-center gap-1 font-medium"
                >
                  <span>AlphaFold DB</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href={`https://www.rcsb.org/structure/${selectedProtein.pdbId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#1A73E8] hover:underline flex items-center gap-1 font-medium"
                >
                  <span>RCSB PDB</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href={`https://www.uniprot.org/uniprotkb/${selectedProtein.uniprotId}/entry`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#1A73E8] hover:underline flex items-center gap-1 font-medium"
                >
                  <span>UniProtKB</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* CHEMISTRY MODE (PubChem PUG REST API) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left: 2D Structure & Molecular Formula */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs text-slate-500 flex items-center gap-2">
                  <span className="font-mono font-semibold text-[#0D9488]">
                    CID: {chemData?.cid || selectedCompound.defaultCid}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>[Literature curated · PubChem PUG REST]</span>
                </div>
                <h2 className="text-base font-bold text-slate-900 mt-0.5">{selectedCompound.nameVi}</h2>
              </div>
              <span className="font-mono text-sm font-bold text-[#0D9488] tabular-nums">
                {chemData?.molecularFormula || selectedCompound.formulaText}
              </span>
            </div>

            <div className="relative bg-slate-50 border border-slate-200 rounded-lg h-[310px] flex items-center justify-center p-4">
              {chemLoading ? (
                <div className="text-xs text-slate-500 font-medium">
                  Đang tải cấu trúc phân tử từ PubChem REST API...
                </div>
              ) : !chemImageError ? (
                <img
                  src={`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${
                    chemData?.cid || selectedCompound.defaultCid
                  }/PNG?image_size=360x360`}
                  alt={`Cấu trúc 2D của ${selectedCompound.nameVi}`}
                  referrerPolicy="no-referrer"
                  onError={() => setChemImageError(true)}
                  className="max-h-[270px] object-contain"
                />
              ) : (
                <div className="text-center space-y-2 p-6">
                  <FlaskConical className="w-10 h-10 text-[#0D9488] mx-auto" />
                  <div className="font-mono text-base font-bold text-slate-800">
                    {chemData?.molecularFormula || selectedCompound.formulaText}
                  </div>
                  <div className="font-mono text-xs text-slate-500 break-all max-w-md">
                    SMILES: {chemData?.canonicalSmiles || 'C6H12O6'}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
              <div className="text-slate-500 font-medium">Chuỗi Canonical SMILES & InChIKey:</div>
              <div className="font-mono text-slate-800 break-all">
                {chemData?.canonicalSmiles || 'Đang tải...'}
              </div>
              {chemData?.inchikey && (
                <div className="font-mono text-[11px] text-slate-500">InChIKey: {chemData.inchikey}</div>
              )}
            </div>
          </div>

          {/* Right: Physicochemical Properties & Lipinski/Veber Rules */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div>
                <div className="text-xs text-slate-500">Ứng dụng trong Hóa học & Sinh học 8</div>
                <p className="text-sm text-slate-800 font-medium mt-1 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  {selectedCompound.khtn8Connection}
                </p>
              </div>

              {chemError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {chemError}
                </div>
              )}

              {/* Physicochemical Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-slate-500">Khối lượng mol (M)</div>
                  <div className="font-mono font-bold text-slate-900 mt-0.5 tabular-nums">
                    {chemData?.molecularWeight ?? '--'} g/mol
                  </div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-slate-500">Độ ưa béo (XLogP)</div>
                  <div className="font-mono font-bold text-slate-900 mt-0.5 tabular-nums">
                    {chemData?.xlogp ?? '--'}
                  </div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-slate-500">Diện tích cực (TPSA)</div>
                  <div className="font-mono font-bold text-slate-900 mt-0.5 tabular-nums">
                    {chemData?.tpsa ?? '--'} Å²
                  </div>
                </div>
              </div>

              {/* Lipinski & Veber Assessment */}
              {drugLikeness && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">
                      Kiểm tra Quy tắc Lipinski & Veber (Sinh khả dụng đường uống):
                    </span>
                    <span
                      className={`font-semibold ${
                        drugLikeness.bioavailable ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {drugLikeness.bioavailable ? 'ĐẠT CHUẨN HẤP THỤ' : `${drugLikeness.violations} VI PHẠM`}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {drugLikeness.checks.map((c, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
                      >
                        <span className="text-slate-700 flex items-center gap-1.5">
                          {c.pass ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          )}
                          <span>{c.label}</span>
                        </span>
                        <span className="font-mono font-semibold text-slate-900 tabular-nums">{c.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-500">Hồ sơ hóa chất chuẩn quốc tế:</span>
              <a
                href={`https://pubchem.ncbi.nlm.nih.gov/compound/${chemData?.cid || selectedCompound.defaultCid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#0D9488] hover:underline flex items-center gap-1 font-medium"
              >
                <span>Mở trên PubChem NCBI</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Gamified Lab Verification Challenge (+45 XP) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Thử Thách Kiểm Chứng Phòng Thí Nghiệm: {currentQuiz.nameVi}
            </h3>
          </div>
          <span className="text-xs font-mono font-semibold text-emerald-700">
            {isQuizSolved ? '✓ Đã nhận +45 XP' : 'Phần thưởng: +45 XP & Thẻ bài Khoa học'}
          </span>
        </div>

        <p className="text-sm font-medium text-slate-800">{currentQuiz.quizQuestion}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {currentQuiz.quizOptions.map((opt, idx) => {
            const isSelected = quizChoice === idx;
            const isCorrect = idx === currentQuiz.quizCorrectIdx;
            let btnStyle = 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800';
            if (quizChoice !== null) {
              if (isCorrect) {
                btnStyle = 'bg-emerald-50 border-emerald-500 text-emerald-950 font-semibold';
              } else if (isSelected) {
                btnStyle = 'bg-red-50 border-red-400 text-red-900';
              }
            }
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleAnswerLabQuiz(idx)}
                className={`p-3 rounded-lg border text-left text-xs transition-colors cursor-pointer flex items-center justify-between gap-2 ${btnStyle}`}
              >
                <span>
                  <span className="font-mono font-bold mr-2">{String.fromCharCode(65 + idx)}.</span>
                  {opt}
                </span>
                {quizChoice !== null && isCorrect && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
