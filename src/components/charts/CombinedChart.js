import {
  ComposedChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useChartTheme } from '@/hooks/useChartTheme';

export default function CombinedChart({
  trafficData,
  revenueData,
  selectedDate,
  onDayClick,
}) {
  const ct = useChartTheme();
  const merged = mergeByDate(trafficData, revenueData);
  const clickable = typeof onDayClick === 'function';

  if (!merged || merged.length === 0) {
    return (
      <div className="empty-state">
        <p>No data for this period</p>
      </div>
    );
  }

  const hasRevenue = merged.some((d) => d.revenue > 0);
  const hasVisitors = merged.some((d) => d.visitors > 0);

  const handleChartClick = (state) => {
    if (!clickable) return;
    const date = state?.activePayload?.[0]?.payload?.date || state?.activeLabel;
    if (!date) return;
    onDayClick(date);
  };

  const dimUnselected = (date) =>
    selectedDate && selectedDate !== date ? 0.35 : 1;

  return (
    <div className={`chart-container${clickable ? ' chart-clickable' : ''}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={merged}
          margin={{ top: 10, right: hasRevenue ? 50 : 20, left: 10, bottom: 5 }}
          onClick={handleChartClick}
          style={clickable ? { cursor: 'pointer' } : undefined}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: ct.axis }}
            tickLine={false}
            axisLine={{ stroke: ct.axisLine }}
            tickFormatter={(val) => {
              if (val.includes(' ')) return val.split(' ')[1];
              const d = new Date(val + 'T00:00:00');
              return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
            }}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: ct.axis }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          {hasRevenue && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: ct.axis }}
              tickLine={false}
              axisLine={false}
              width={50}
              tickFormatter={(v) => `$${(v / 100).toFixed(0)}`}
            />
          )}
          <Tooltip
            contentStyle={{
              background: ct.tooltipBg,
              border: `1px solid ${ct.tooltipBorder}`,
              borderRadius: 8,
              fontSize: 13,
              color: ct.tooltipText,
              boxShadow: ct.tooltipShadow,
            }}
            itemStyle={{ color: ct.tooltipText }}
            labelStyle={{ color: ct.tooltipLabel }}
            formatter={(value, name) => {
              if (name === 'revenue') return [`$${(value / 100).toFixed(2)}`, 'Revenue'];
              if (name === 'page_views') return [value.toLocaleString(), 'Pageviews'];
              if (name === 'visitors') return [value.toLocaleString(), 'Visitors'];
              return [value.toLocaleString(), name];
            }}
            labelFormatter={(label) => {
              const base = formatChartLabel(label);
              if (!clickable) return base;
              if (selectedDate === label) return `${base} · click to clear`;
              return `${base} · click for locations`;
            }}
          />
          {hasRevenue && (
            <Bar
              yAxisId="right"
              dataKey="revenue"
              fill={ct.barRevenue}
              radius={[4, 4, 0, 0]}
              barSize={20}
              opacity={0.75}
              cursor={clickable ? 'pointer' : undefined}
            >
              {merged.map((entry) => (
                <Cell
                  key={`revenue-${entry.date}`}
                  fill={ct.barRevenue}
                  opacity={0.75 * dimUnselected(entry.date)}
                  stroke={selectedDate === entry.date ? ct.barSecondary : undefined}
                  strokeWidth={selectedDate === entry.date ? 2 : 0}
                />
              ))}
            </Bar>
          )}
          <Bar
            yAxisId="left"
            dataKey="page_views"
            fill={ct.barPrimary}
            radius={[4, 4, 0, 0]}
            barSize={20}
            cursor={clickable ? 'pointer' : undefined}
          >
            {merged.map((entry) => (
              <Cell
                key={`pv-${entry.date}`}
                fill={selectedDate === entry.date ? ct.barSecondary : ct.barPrimary}
                opacity={dimUnselected(entry.date)}
              />
            ))}
          </Bar>
          {hasVisitors && (
            <Bar
              yAxisId="left"
              dataKey="visitors"
              fill={ct.barSecondary}
              radius={[4, 4, 0, 0]}
              barSize={20}
              cursor={clickable ? 'pointer' : undefined}
            >
              {merged.map((entry) => (
                <Cell
                  key={`visitors-${entry.date}`}
                  fill={ct.barSecondary}
                  opacity={dimUnselected(entry.date)}
                />
              ))}
            </Bar>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function formatChartLabel(val) {
  if (!val) return '';
  if (String(val).includes(' ')) {
    const [day, hour] = String(val).split(' ');
    const d = new Date(day + 'T00:00:00');
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${hour}`;
  }
  const d = new Date(val + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function mergeByDate(traffic = [], revenue = []) {
  const map = {};
  for (const t of traffic) {
    map[t.date] = { ...t, revenue: 0 };
  }
  for (const r of revenue) {
    if (map[r.date]) {
      map[r.date].revenue = r.revenue || 0;
    } else {
      map[r.date] = { date: r.date, page_views: 0, visitors: 0, sessions: 0, revenue: r.revenue || 0 };
    }
  }
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}
