import { useEffect, useMemo, useRef, useState } from 'react';
import { useDateRange } from '@/contexts/DateRangeContext';

const NODE_WIDTH = 160;
const NODE_HEIGHT = 40;
const COL_GAP = 56;
const ROW_GAP = 10;

/**
 * Flatten a tree into positioned nodes laid out in columns by depth.
 * Each node gets {id, x, y, pathname, visitors, parentId}.
 */
function layoutTree(root) {
  if (!root) return { nodes: [], links: [], width: 0, height: 0 };

  const columns = []; // columns[depth] = array of nodes
  const nodes = [];
  const links = [];
  let nextId = 0;

  function visit(node, depth, parentId) {
    const id = nextId++;
    if (!columns[depth]) columns[depth] = [];
    columns[depth].push(id);
    nodes.push({
      id,
      depth,
      pathname: node.pathname,
      visitors: node.visitors,
      parentId,
    });
    if (parentId !== null) {
      links.push({ source: parentId, target: id, value: node.visitors });
    }
    if (node.children) {
      for (const c of node.children) visit(c, depth + 1, id);
    }
  }
  visit(root, 0, null);

  // Assign y positions per column, centered.
  const colHeights = columns.map((col) => col.length * NODE_HEIGHT + (col.length - 1) * ROW_GAP);
  const totalHeight = Math.max(...colHeights, NODE_HEIGHT);

  for (let depth = 0; depth < columns.length; depth++) {
    const col = columns[depth];
    const colHeight = colHeights[depth];
    const startY = (totalHeight - colHeight) / 2;
    col.forEach((nodeId, i) => {
      const n = nodes[nodeId];
      n.x = depth * (NODE_WIDTH + COL_GAP);
      n.y = startY + i * (NODE_HEIGHT + ROW_GAP);
    });
  }

  const width = columns.length * NODE_WIDTH + (columns.length - 1) * COL_GAP;
  return { nodes, links, width, height: totalHeight };
}

export default function FlowView({ siteId }) {
  const { getParams } = useDateRange();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [root, setRoot] = useState(null);
  const [convertersOnly, setConvertersOnly] = useState(false);
  const [hoverId, setHoverId] = useState(null);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      ...getParams(),
      ...(root ? { root } : {}),
      ...(convertersOnly ? { converters: '1' } : {}),
    });
    fetch(`/api/analytics/${siteId}/flow?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setData(d); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, root, convertersOnly, JSON.stringify(getParams())]);

  const layout = useMemo(() => layoutTree(data?.root), [data]);
  const maxVisitors = data?.root?.visitors || 1;

  if (loading) {
    return <div className="loading-inline"><div className="loading-spinner" /></div>;
  }

  if (!data || !data.root) {
    return (
      <div className="empty-state" style={{ padding: '40px 20px' }}>
        <h3>No flow yet</h3>
        <p>Need at least a few visitors with page-view history in this date range.</p>
      </div>
    );
  }

  const padding = 24;
  const svgW = layout.width + padding * 2;
  const svgH = layout.height + padding * 2;

  // Build a quick parent lookup so hover can highlight ancestors + descendants.
  const childrenOf = new Map();
  for (const l of layout.links) {
    if (!childrenOf.has(l.source)) childrenOf.set(l.source, []);
    childrenOf.get(l.source).push(l.target);
  }
  const parentOf = new Map();
  for (const l of layout.links) parentOf.set(l.target, l.source);

  const highlighted = new Set();
  if (hoverId !== null) {
    let cur = hoverId;
    while (cur !== undefined && cur !== null) {
      highlighted.add(cur);
      cur = parentOf.get(cur);
    }
    const stack = [hoverId];
    while (stack.length) {
      const n = stack.pop();
      const kids = childrenOf.get(n) || [];
      for (const k of kids) {
        highlighted.add(k);
        stack.push(k);
      }
    }
  }

  return (
    <div className="flow">
      <div className="flow-toolbar">
        <div className="flow-meta">
          <strong>{data.totalVisitors.toLocaleString()}</strong> visitors in range ·
          <strong> {data.root.visitors.toLocaleString()}</strong> reached <code>{data.root.pathname}</code>
        </div>
        <div className="flow-controls">
          <label className="flow-toggle">
            <input
              type="checkbox"
              checked={convertersOnly}
              onChange={(e) => setConvertersOnly(e.target.checked)}
            />
            Converters only
          </label>
          {data.entryOptions?.length > 0 && (
            <select
              className="flow-select"
              value={data.root.pathname}
              onChange={(e) => setRoot(e.target.value)}
            >
              {data.entryOptions.map((o) => (
                <option key={o.pathname} value={o.pathname}>
                  {o.pathname} ({o.visitors})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="flow-canvas">
        <svg width={svgW} height={svgH} style={{ display: 'block' }}>
          <g transform={`translate(${padding}, ${padding})`}>
            {/* Links */}
            {layout.links.map((l, i) => {
              const src = layout.nodes[l.source];
              const tgt = layout.nodes[l.target];
              const x1 = src.x + NODE_WIDTH;
              const y1 = src.y + NODE_HEIGHT / 2;
              const x2 = tgt.x;
              const y2 = tgt.y + NODE_HEIGHT / 2;
              const cx = (x1 + x2) / 2;
              const d = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
              const strokeW = Math.max(1, (l.value / maxVisitors) * 12);
              const isHi = highlighted.has(l.source) && highlighted.has(l.target);
              const dim = hoverId !== null && !isHi;
              return (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke="var(--accent)"
                  strokeOpacity={dim ? 0.08 : isHi ? 0.55 : 0.25}
                  strokeWidth={strokeW}
                  strokeLinecap="round"
                />
              );
            })}

            {/* Nodes */}
            {layout.nodes.map((n) => {
              const isHi = highlighted.has(n.id);
              const dim = hoverId !== null && !isHi;
              const widthPct = (n.visitors / maxVisitors) * 100;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x}, ${n.y})`}
                  onMouseEnter={() => setHoverId(n.id)}
                  onMouseLeave={() => setHoverId(null)}
                  onClick={() => setRoot(n.pathname)}
                  style={{ cursor: 'pointer', opacity: dim ? 0.4 : 1, transition: 'opacity 0.15s' }}
                >
                  <rect
                    width={NODE_WIDTH}
                    height={NODE_HEIGHT}
                    rx={5}
                    fill="var(--bg-card)"
                    stroke={isHi ? 'var(--accent)' : 'var(--border)'}
                    strokeWidth={isHi ? 1.25 : 1}
                  />
                  {/* fill bar */}
                  <rect
                    x={0}
                    y={NODE_HEIGHT - 2}
                    width={(NODE_WIDTH * widthPct) / 100}
                    height={2}
                    rx={1}
                    fill="var(--accent)"
                    opacity={0.6}
                  />
                  <foreignObject x={8} y={4} width={NODE_WIDTH - 16} height={NODE_HEIGHT - 8}>
                    <div className="flow-node-content">
                      <div className="flow-node-path" title={n.pathname}>{n.pathname}</div>
                      <div className="flow-node-visitors">
                        <strong>{n.visitors.toLocaleString()}</strong>
                        <span>visitors</span>
                      </div>
                    </div>
                  </foreignObject>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="flow-hint">Click any node to make it the new starting point. Hover to trace flow.</div>
    </div>
  );
}
