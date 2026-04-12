function Sparkline({ data, color = 'var(--primary)', height = 40 }) {
  if (!data || data.length === 0) {
    return <div style={{ height, width: '100%' }} />;
  }

  const values = data.map(d => d.calls);
  const maxValue = Math.max(...values, 1);
  const width = 120;
  
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (d.calls / maxValue) * (height - 4);
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg 
      width="100%" 
      height={height} 
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#sparklineGradient)`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {data.length > 0 && (
        <circle 
          cx={width} 
          cy={height - (values[values.length - 1] / maxValue) * (height - 4)} 
          r="3" 
          fill={color} 
        />
      )}
    </svg>
  );
}

export default Sparkline;