import './FarmLayout.css'

// All coordinates in cm. 1 SVG unit = 1 cm.
const PATH    = 30                                   // 通路 width
const BED_W   = 400                                  // bed area width
const LABEL_M = 15                                   // margin above first bed for size labels
const MELON_H = 95
const GAP     = 30

const BED_X    = PATH                                // 30
const MELON1_Y = PATH + LABEL_M                     // 45
const MELON2_Y = MELON1_Y + MELON_H + GAP           // 170
const LOWER_Y  = MELON2_Y + MELON_H + GAP           // 295

const SPLIT_W  = 95
const SPLIT_H  = 500
const HALF_H   = SPLIT_H / 2                        // 250

const POTATO_W = 45
const POTATO_H = 400
const POTATO_X = BED_X + BED_W - POTATO_W           // 385

const NEGUI_W  = 200
const NEGUI_H  = 40
const NEGUI_X  = BED_X + (BED_W - NEGUI_W) / 2     // 130
const NEGUI_Y  = LOWER_Y + SPLIT_H - NEGUI_H        // 755

const RIGHT_X  = PATH + BED_W                       // 430 — right edge of bed area
const VIEW_W   = RIGHT_X + 4                        // +4 so right strokes aren't clipped
const VIEW_H   = LOWER_Y + SPLIT_H + 4              // +4 so bottom strokes aren't clipped

function hDots(n: number, x: number, cy: number, w: number, r: number, fill: string) {
  return Array.from({ length: n }, (_, i) => (
    <circle key={i} cx={x + (w * (i + 1)) / (n + 1)} cy={cy} r={r} fill={fill} />
  ))
}

function vDots(n: number, cx: number, y: number, h: number, topPad: number, r: number, fill: string) {
  const avail = h - topPad
  return Array.from({ length: n }, (_, i) => (
    <circle key={i} cx={cx} cy={y + topPad + (avail * (i + 1)) / (n + 1)} r={r} fill={fill} />
  ))
}

function SizeLabel({ x, y, text, color }: { x: number; y: number; text: string; color: string }) {
  return <text x={x} y={y} textAnchor="end" fontSize={11} fontWeight={700} fill={color}>{text}</text>
}

export default function FarmLayout() {
  return (
    <div className="farm-layout">
      <h2 className="farm-layout__title">区画レイアウト <small>● = 植付位置</small></h2>

      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="farm-plot-svg">

        {/* ── Plot background + paths ─────────────────────── */}
        <rect x={0} y={0} width={VIEW_W} height={VIEW_H} rx={8} fill="#f8fafc" />
        <rect x={0} y={0} width={VIEW_W} height={PATH} fill="#e2e8f0" />
        <rect x={0} y={0} width={PATH}   height={VIEW_H} fill="#e2e8f0" />
        <text x={BED_X + BED_W / 2} y={PATH * 0.72} textAnchor="middle" fontSize={11} fontWeight={700} fontStyle="italic" fill="#94a3b8">通路 30cm</text>
        <text x={PATH / 2} y={VIEW_H / 2} textAnchor="middle" fontSize={11} fontWeight={700} fontStyle="italic" fill="#94a3b8" transform={`rotate(-90, ${PATH / 2}, ${VIEW_H / 2})`}>通路 30cm</text>

        {/* ── メロン（ユウカ） ────────────────────────────── */}
        <rect x={BED_X} y={MELON1_Y} width={BED_W} height={MELON_H} rx={4} fill="#f0fdf4" stroke="#22c55e" strokeWidth={1.5} />
        <text x={BED_X + BED_W / 2} y={MELON1_Y + 28} textAnchor="middle" fontSize={20} fontWeight={700} fill="#166534">メロン（ユウカ）</text>
        <text x={BED_X + BED_W / 2} y={MELON1_Y + 46} textAnchor="middle" fontSize={13} fill="#166534">株間70cm</text>
        {hDots(4, BED_X, MELON1_Y + MELON_H * 0.78, BED_W, 9, '#16a34a')}
        <SizeLabel x={RIGHT_X} y={MELON1_Y - 3} text="95cm × 4m" color="#16a34a" />

        {/* ── メロン（プリンス） ──────────────────────────── */}
        <rect x={BED_X} y={MELON2_Y} width={BED_W} height={MELON_H} rx={4} fill="#f0fdf4" stroke="#22c55e" strokeWidth={1.5} />
        <text x={BED_X + BED_W / 2} y={MELON2_Y + 28} textAnchor="middle" fontSize={20} fontWeight={700} fill="#166534">メロン（プリンス）</text>
        <text x={BED_X + BED_W / 2} y={MELON2_Y + 46} textAnchor="middle" fontSize={13} fill="#166534">株間70cm</text>
        {hDots(4, BED_X, MELON2_Y + MELON_H * 0.78, BED_W, 9, '#16a34a')}
        <SizeLabel x={VIEW_W} y={MELON2_Y - 3} text="95cm × 4m" color="#16a34a" />

        {/* ── トマト (top half of split bed) ─────────────── */}
        <rect x={BED_X} y={LOWER_Y} width={SPLIT_W} height={HALF_H} fill="#fff5f5" />
        <text x={BED_X + SPLIT_W / 2} y={LOWER_Y + 18} textAnchor="middle" fontSize={14} fontWeight={700} fill="#b91c1c">トマト</text>
        <text x={BED_X + SPLIT_W / 2} y={LOWER_Y + 34} textAnchor="middle" fontSize={11} fill="#b91c1c">株間50cm</text>
        {vDots(4, BED_X + SPLIT_W / 2, LOWER_Y, HALF_H, 44, 8, '#b91c1c')}

        {/* ── ナス (bottom half of split bed) ────────────── */}
        <rect x={BED_X} y={LOWER_Y + HALF_H} width={SPLIT_W} height={HALF_H} fill="#faf5ff" />
        <text x={BED_X + SPLIT_W / 2} y={LOWER_Y + HALF_H + 18} textAnchor="middle" fontSize={14} fontWeight={700} fill="#7e22ce">ナス</text>
        <text x={BED_X + SPLIT_W / 2} y={LOWER_Y + HALF_H + 34} textAnchor="middle" fontSize={11} fill="#7e22ce">株間60cm</text>
        {vDots(3, BED_X + SPLIT_W / 2, LOWER_Y + HALF_H, HALF_H, 44, 8, '#7e22ce')}

        {/* split bed outer border + divider, drawn on top of fills */}
        <line x1={BED_X} y1={LOWER_Y + HALF_H} x2={BED_X + SPLIT_W} y2={LOWER_Y + HALF_H} stroke="#f1f5f9" strokeWidth={1} />
        <rect x={BED_X} y={LOWER_Y} width={SPLIT_W} height={SPLIT_H} rx={4} fill="none" stroke="#e2e8f0" strokeWidth={1.5} />
        <SizeLabel x={BED_X + SPLIT_W} y={LOWER_Y - 3} text="5m × 95cm" color="#64748b" />

        {/* ── 芋 ─────────────────────────────────────────── */}
        <rect x={POTATO_X} y={LOWER_Y} width={POTATO_W} height={POTATO_H} rx={4} fill="#fff7ed" stroke="#f97316" strokeWidth={1.5} />
        <text x={POTATO_X + POTATO_W / 2} y={LOWER_Y + 18} textAnchor="middle" fontSize={14} fontWeight={700} fill="#9a3412">芋</text>
        <text x={POTATO_X + POTATO_W / 2} y={LOWER_Y + 33} textAnchor="middle" fontSize={10} fill="#9a3412">株間</text>
        <text x={POTATO_X + POTATO_W / 2} y={LOWER_Y + 44} textAnchor="middle" fontSize={10} fill="#9a3412">35cm</text>
        {vDots(10, POTATO_X + POTATO_W / 2, LOWER_Y, POTATO_H, 52, 7, '#ea580c')}
        <SizeLabel x={RIGHT_X} y={LOWER_Y - 3} text="4m × 45cm" color="#ea580c" />

        {/* ── ネギ ────────────────────────────────────────── */}
        <rect x={NEGUI_X} y={NEGUI_Y} width={NEGUI_W} height={NEGUI_H} rx={4} fill="#f0f9ff" stroke="#38bdf8" strokeWidth={1.5} />
        <text x={NEGUI_X + NEGUI_W / 2} y={NEGUI_Y + 15} textAnchor="middle" fontSize={14} fontWeight={700} fill="#0c4a6e">ネギ</text>
        {hDots(4, NEGUI_X, NEGUI_Y + 28, NEGUI_W, 6, '#0284c7')}
        <SizeLabel x={NEGUI_X + NEGUI_W} y={NEGUI_Y - 3} text="40cm × 200cm" color="#0284c7" />

        {/* ── outer border + compass ───────────────────────── */}
        <rect x={0} y={0} width={VIEW_W} height={VIEW_H} rx={8} fill="none" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="8 4" />
        <text x={VIEW_W - 4} y={VIEW_H - 4} textAnchor="end" fontSize={10} fontStyle="italic" fontWeight={700} fill="#cbd5e1">N ↗</text>

      </svg>
    </div>
  )
}
