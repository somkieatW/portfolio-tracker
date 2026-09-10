import { T } from "../../theme/tokens.js";

const Candle = (props) => {
  const { x, y, width, height, open, close, high, low } = props;
  const isUp = close >= open;
  const candleColor = isUp ? T.green : T.red;

  const xc = x + width / 2;

  // Robust coordinate calculation for wicks
  const bodyMax = Math.max(open, close);
  const bodyMin = Math.min(open, close);
  const bodyRange = Math.max(0.01, Math.abs(bodyMax - bodyMin));
  const pxPerUnit = height / bodyRange;

  const highY = y - (high - bodyMax) * pxPerUnit;
  const lowY = y + height + (bodyMin - low) * pxPerUnit;

  return (
    <g>
      {/* Wick */}
      <line x1={xc} y1={lowY} x2={xc} y2={highY} stroke={candleColor} strokeWidth={1.5} />
      {/* Body */}
      <rect
        x={x}
        y={y}
        width={width}
        height={Math.max(1.5, height)}
        fill={candleColor}
        stroke={candleColor}
        strokeWidth={0.5}
      />
    </g>
  );
};

export default Candle;
