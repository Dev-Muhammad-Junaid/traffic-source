import { useState } from 'react';

export default function AnalyticsPanel({
  tabs,
  data,
  valueKey = 'count',
  labelKey = 'name',
  defaultTab,
  renderValue,
  renderLabel,
  showPercentage = false,
  barByTotal = false,
  onRowClick,
  activeFilter,
  renderDetails,
}) {
  const [activeTab, setActiveTab] = useState(defaultTab || (tabs && tabs[0]?.key));
  const [expanded, setExpanded] = useState(null);

  const activeData = tabs ? data?.[activeTab] || [] : data || [];
  const totalValue = activeData.reduce((sum, row) => sum + (row[valueKey] || 0), 0);
  const maxValue = Math.max(...activeData.map((r) => r[valueKey] || 0), 1);

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-tabs">
          {tabs?.map((tab) => (
            <button
              key={tab.key}
              className={`panel-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="panel-sort">Visitors &#x2195;</div>
      </div>
      <div className="panel-body">
        {activeData.length === 0 ? (
          <div className="empty-state"><p>No data yet</p></div>
        ) : (
          activeData.map((row, i) => {
            const rowValue = row[valueKey] || 0;
            const sharePct = totalValue > 0 ? (rowValue / totalValue) * 100 : 0;
            const barPct = barByTotal
              ? sharePct
              : (rowValue / maxValue) * 100;
            const displayValue = renderValue
              ? renderValue(rowValue, row, { sharePct, barPct, activeTab })
              : formatNumber(rowValue);

            const isActive = activeFilter && activeFilter.tab === activeTab && activeFilter.value === row[labelKey];
            const canExpand = !!renderDetails && activeTab === 'ip';
            const clickable = canExpand || !!onRowClick;
            const isOpen = canExpand && expanded === row[labelKey];

            return (
              <div key={i}>
                <div
                  className={`analytics-row${clickable ? ' clickable' : ''}${isActive || isOpen ? ' row-active' : ''}`}
                  onClick={clickable ? () => {
                    if (canExpand) {
                      setExpanded(isOpen ? null : row[labelKey]);
                      return;
                    }
                    onRowClick(row, activeTab);
                  } : undefined}
                >
                  <div
                    className="analytics-row-bar"
                    style={{ width: `${barPct}%` }}
                  />
                  <div className="analytics-row-name">
                    {renderLabel
                      ? renderLabel(row, { sharePct, barPct, activeTab })
                      : row[labelKey]}
                  </div>
                  <div className="analytics-row-value">
                    {displayValue}
                    {showPercentage && (
                      <span className="analytics-row-percent">
                        {formatPercent(sharePct)}
                      </span>
                    )}
                  </div>
                </div>
                {isOpen && (
                  <div className="ip-details">{renderDetails(row)}</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function formatNumber(n) {
  if (n === undefined || n === null) return '-';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return n.toLocaleString();
}

function formatPercent(n) {
  if (!Number.isFinite(n)) return '0%';
  if (n >= 10) return `${n.toFixed(1)}%`;
  return `${n.toFixed(2)}%`;
}
