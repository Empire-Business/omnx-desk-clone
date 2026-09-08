interface SparklineProps {
  values: number[]
  width?: number
  height?: number
  className?: string
  /** Cor da linha; se omitida, infere do trend (verde sobe, vermelho desce). */
  color?: string
}

export function Sparkline({ values, width = 60, height = 20, color, className }: SparklineProps) {
  if (values.length < 2) {
    return <div className={className} style={{ width, height }} aria-hidden />
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const stepX = width / (values.length - 1)
  const points = values
    .map((v, i) => {
      const x = i * stepX
      const y = height - ((v - min) / span) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const trendUp = values[values.length - 1] >= values[0]
  const stroke = color ?? (trendUp ? 'hsl(142 76% 36%)' : 'hsl(0 84% 60%)')

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={(values.length - 1) * stepX}
        cy={height - ((values[values.length - 1] - min) / span) * height}
        r="1.8"
        fill={stroke}
      />
    </svg>
  )
}
