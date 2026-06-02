import './FarmLayout.css'

function dotCount(lengthCm: number, spacingCm: number): number {
  return Math.floor(lengthCm / spacingCm) - 1
}

function HorizontalDots({ count }: { count: number }) {
  return (
    <div className="farm-bed__dots farm-bed__dots--h">
      {Array.from({ length: count }, (_, i) => <span key={i} className="farm-bed__dot">●</span>)}
    </div>
  )
}

function VerticalDots({ count }: { count: number }) {
  return (
    <div className="farm-bed__dots farm-bed__dots--v">
      {Array.from({ length: count }, (_, i) => <span key={i} className="farm-bed__dot">●</span>)}
    </div>
  )
}

export default function FarmLayout() {
  // Bed dimensions: width × length (cm). Dots run along the length.
  const melonDots    = dotCount(400, 70)   // 4m bed, 株間70cm
  const tomatoDots   = dotCount(250, 50)   // half of 5m bed, 株間50cm
  const eggplantDots = dotCount(250, 60)   // half of 5m bed, 株間60cm
  const potatoDots   = dotCount(400, 35)   // 4m bed, 株間35cm

  return (
    <div className="farm-layout">
      <h2 className="farm-layout__title">区画レイアウト <small>● = 植付位置</small></h2>

      <div className="farm-plot">
        <div className="farm-plot__path-top">通路 50cm</div>
        <div className="farm-plot__path-left">通路 50cm</div>

        <div className="farm-plot__beds">
          <div className="farm-bed farm-bed--melon">
            <span className="farm-bed__size">95cm × 4m</span>
            <span className="farm-bed__name">メロン（ユウカ）<small>株間70cm</small></span>
            <HorizontalDots count={melonDots} />
          </div>

          <div className="farm-bed farm-bed--melon">
            <span className="farm-bed__size">95cm × 4m</span>
            <span className="farm-bed__name">メロン（プリンス）<small>株間70cm</small></span>
            <HorizontalDots count={melonDots} />
          </div>

          <div className="farm-plot__lower">
            <div className="farm-bed farm-bed--split">
              <span className="farm-bed__size">95cm × 5m</span>
              <div className="farm-bed farm-bed--tomato">
                <span className="farm-bed__name">トマト<small>株間50cm</small></span>
                <VerticalDots count={tomatoDots} />
              </div>
              <div className="farm-bed farm-bed--eggplant">
                <span className="farm-bed__name">ナス<small>株間60cm</small></span>
                <VerticalDots count={eggplantDots} />
              </div>
            </div>

            <div className="farm-bed farm-bed--potato">
              <span className="farm-bed__size">45cm × 4m</span>
              <span className="farm-bed__name">芋<small>株間35cm</small></span>
              <VerticalDots count={potatoDots} />
            </div>
          </div>
        </div>

        <div className="farm-plot__compass">N ↗</div>
      </div>
    </div>
  )
}
