import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { colors } from '../theme';
import { fmtShort } from '../utils/format';

const H = 170;
const PAD = { l: 38, r: 14, t: 16, b: 26 };

/** Line chart of weight over time. `points`: [{ measuredAt, value }] in chronological order. */
export default function WeightChart({ points, unit }) {
  const [w, setW] = useState(0);
  const onLayout = (e) => setW(e.nativeEvent.layout.width);
  if (!points?.length) return <View style={{ height: H }} />;

  const xs = points.map((p) => new Date(p.measuredAt).getTime());
  const vs = points.map((p) => p.value);
  const minV = Math.min(...vs);
  const maxV = Math.max(...vs);
  const span = Math.max(maxV - minV, 0.5);
  const lo = minV - span * 0.25;
  const hi = maxV + span * 0.25;
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const innerW = Math.max(w - PAD.l - PAD.r, 1);
  const innerH = H - PAD.t - PAD.b;
  const X = (t) => PAD.l + (x1 === x0 ? innerW / 2 : ((t - x0) / (x1 - x0)) * innerW);
  const Y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * innerH;

  const coords = points.map((p, i) => [X(xs[i]), Y(p.value)]);
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${PAD.t + innerH} L${coords[0][0].toFixed(1)},${PAD.t + innerH} Z`;
  const ticks = [hi - (hi - lo) * 0.1, (hi + lo) / 2, lo + (hi - lo) * 0.1];
  const last = coords[coords.length - 1];

  return (
    <View onLayout={onLayout} style={{ height: H }}>
      {w > 0 && (
        <Svg width={w} height={H}>
          <Defs>
            <LinearGradient id="wfill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.greenBar} stopOpacity="0.35" />
              <Stop offset="1" stopColor={colors.greenBar} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          {ticks.map((v, i) => (
            <G key={i}>
              <Line x1={PAD.l} x2={w - PAD.r} y1={Y(v)} y2={Y(v)} stroke={colors.line} strokeWidth="1" strokeDasharray="4 4" />
              <SvgText x={PAD.l - 6} y={Y(v) + 4} fontSize="10" fill={colors.inkMute} textAnchor="end">{Math.round(v * 10) / 10}</SvgText>
            </G>
          ))}
          {points.length > 1 && <Path d={area} fill="url(#wfill)" />}
          {points.length > 1 && <Path d={line} stroke={colors.green} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          {coords.map(([x, y], i) => (
            <Circle key={i} cx={x} cy={y} r={i === coords.length - 1 ? 6 : 4} fill={i === coords.length - 1 ? colors.green : '#fff'} stroke={colors.green} strokeWidth="2.5" />
          ))}
          <SvgText x={Math.min(last[0], w - PAD.r - 10)} y={Math.max(last[1] - 12, 10)} fontSize="12" fontWeight="700" fill={colors.greenDark} textAnchor="end">
            {`${points[points.length - 1].value} ${unit}`}
          </SvgText>
          <SvgText x={PAD.l} y={H - 6} fontSize="10" fill={colors.inkMute} textAnchor="start">{fmtShort(points[0].measuredAt)}</SvgText>
          {points.length > 1 && (
            <SvgText x={w - PAD.r} y={H - 6} fontSize="10" fill={colors.inkMute} textAnchor="end">{fmtShort(points[points.length - 1].measuredAt)}</SvgText>
          )}
        </Svg>
      )}
    </View>
  );
}
