// Area chart with a fluorescent gradient fill, dashed reference line and a glowing
// marker on the latest point (inspired by sports-tracker elevation graphs).
import { useId } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts';

function LastDot({ cx, cy, index, dataLength, color }) {
  if (index !== dataLength - 1 || cx === undefined) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={14} fill={color} opacity={0.18} />
      <circle cx={cx} cy={cy} r={8} fill={color} opacity={0.35} />
      <circle cx={cx} cy={cy} r={5} fill="#04090a" stroke={color} strokeWidth={2.5} />
    </g>
  );
}

function GlassTooltip({ active, payload, label, unit, format }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className="rounded-xl border border-white/10 bg-[#04090a]/85 px-3 py-2 text-xs text-white shadow-xl backdrop-blur">
      <p className="text-white/60">{label}</p>
      <p className="num text-base">{format ? format(v) : v}{unit && <span className="ml-0.5 text-white/60">{unit}</span>}</p>
    </div>
  );
}

/**
 * @param {{ data: Array<{label:string, value:number}>, color?: string, height?: number,
 *           reference?: number, referenceLabel?: string, unit?: string, domain?: [number|string, number|string], format?: (v:number)=>string }} props
 */
export default function GlowAreaChart({ data, color = '#c2ee2a', height = 220, reference, referenceLabel, unit, domain = ['auto', 'auto'], format }) {
  const id = useId().replace(/:/g, '');
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 18, right: 22, left: -14, bottom: 0 }}>
          <defs>
            <linearGradient id={`fill${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.55} />
              <stop offset="55%" stopColor="#0d9488" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#0d9488" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`line${id}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#14b8a6" />
              <stop offset="100%" stopColor={color} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical horizontal={false} stroke="currentColor" strokeOpacity={0.07} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.55 }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis domain={domain} tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.55 }} axisLine={false} tickLine={false} width={44} tickFormatter={format} />
          {typeof reference === 'number' && (
            <ReferenceLine y={reference} stroke="currentColor" strokeOpacity={0.45} strokeDasharray="4 4" label={referenceLabel ? { value: referenceLabel, position: 'insideTopLeft', fontSize: 10, fill: 'currentColor', opacity: 0.6 } : undefined} />
          )}
          <Tooltip content={<GlassTooltip unit={unit} format={format} />} cursor={{ stroke: color, strokeOpacity: 0.4 }} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={`url(#line${id})`}
            strokeWidth={2.5}
            fill={`url(#fill${id})`}
            isAnimationActive
            dot={(p) => <LastDot key={p.index} {...p} dataLength={data.length} color={color} />}
            activeDot={{ r: 5, fill: color, stroke: '#04090a', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
