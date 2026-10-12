function pathFor(values, width, height, padding, min, max) {
  if (!values.length) return '';
  const usableW = width - padding * 2;
  const usableH = height - padding * 2;
  return values.map((value, index) => {
    const x = padding + (values.length === 1 ? 0 : index * usableW / (values.length - 1));
    const y = padding + (max === min ? usableH / 2 : (max - value) * usableH / (max - min));
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

export default function LineChart({ series, reserve = null, height = 260 }) {
  const width = 760;
  const padding = 34;
  const allValues = series.flatMap((item) => item.values).filter(Number.isFinite);
  if (reserve !== null) allValues.push(Number(reserve));
  if (!allValues.length) return <div className="empty-state">No chart data available.</div>;
  const minValue = Math.min(...allValues, 0);
  const maxValue = Math.max(...allValues, 1);
  const rangePadding = Math.max(1, (maxValue - minValue) * 0.1);
  const min = minValue - rangePadding;
  const max = maxValue + rangePadding;
  const y = (value) => padding + (max - value) * (height - padding * 2) / (max - min);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cash flow forecast chart">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const yy = padding + ratio * (height - padding * 2);
          const label = max - ratio * (max - min);
          return <g key={ratio}><line className="grid-line" x1={padding} x2={width - padding} y1={yy} y2={yy} /><text className="axis-label" x="4" y={yy + 4}>{Math.round(label / 1000)}k</text></g>;
        })}
        {reserve !== null ? <line className="reserve-line" x1={padding} x2={width - padding} y1={y(reserve)} y2={y(reserve)} /> : null}
        {series.map((item, index) => <path key={item.name} className={`chart-line line-${index + 1}`} d={pathFor(item.values, width, height, padding, min, max)} fill="none" />)}
      </svg>
      <div className="chart-legend">
        {series.map((item, index) => <span key={item.name}><i className={`legend-dot line-${index + 1}`} />{item.name}</span>)}
        {reserve !== null ? <span><i className="legend-dot reserve-dot" />Minimum reserve</span> : null}
      </div>
    </div>
  );
}
