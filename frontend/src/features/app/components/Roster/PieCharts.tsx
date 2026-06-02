import React from 'react';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import type { UiStudent, ClassStatus, GrepthinkStatus } from './rosterTypes';
import './PieCharts.scss';

interface PieChartsProps {
  students: UiStudent[];
}

const CLASS_STATUS_COLORS: Record<ClassStatus, string> = {
  enrolled: '#018156',
  waitlisted: '#F59E0B',
  dropped: '#EF4444',
  not_on_roster: '#9CA3AF',
};

const CLASS_STATUS_LABELS: Record<ClassStatus, string> = {
  enrolled: 'Enrolled',
  waitlisted: 'Waitlisted',
  dropped: 'Dropped',
  not_on_roster: 'Not on Roster',
};

const GT_STATUS_COLORS: Record<GrepthinkStatus, string> = {
  registered: '#018156',
  not_registered: '#DADADA',
};

const GT_STATUS_LABELS: Record<GrepthinkStatus, string> = {
  registered: 'Registered',
  not_registered: 'Not Registered',
};

interface ChartEntry {
  name: string;
  value: number;
  /** color drives both the Cell fill and tooltip dot */
  color: string;
}

interface SlicePayloadItem {
  name?: string;
  value?: number;
  /** recharts v3 passes the original data object here */
  payload?: ChartEntry;
}

const SliceTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: SlicePayloadItem[];
}) => {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const dotColor = item.payload?.color;
  return (
    <div className="pie-charts__tooltip">
      <span className="pie-charts__tooltip-dot" style={{ backgroundColor: dotColor }} />
      <span className="pie-charts__tooltip-name">{item.name}</span>
      <span className="pie-charts__tooltip-value">{item.value}</span>
    </div>
  );
};

const PieCharts: React.FC<PieChartsProps> = ({ students }) => {
  const classStatusData: ChartEntry[] = (Object.keys(CLASS_STATUS_COLORS) as ClassStatus[])
    .map((status) => ({
      name: CLASS_STATUS_LABELS[status],
      value: students.filter((s) => s.classStatus === status).length,
      color: CLASS_STATUS_COLORS[status],
    }))
    .filter((d) => d.value > 0);

  const gtStatusData: ChartEntry[] = (Object.keys(GT_STATUS_COLORS) as GrepthinkStatus[])
    .map((status) => ({
      name: GT_STATUS_LABELS[status],
      value: students.filter((s) => s.grepthinkStatus === status).length,
      color: GT_STATUS_COLORS[status],
    }))
    .filter((d) => d.value > 0);

  const renderChart = (title: string, data: ChartEntry[], total: number) => (
    <div className="pie-charts__card">
      <h3 className="pie-charts__card-title">{title}</h3>

      <div className="pie-charts__chart-wrapper">
        <PieChart width={200} height={200}>
          <Pie data={data} cx={100} cy={100} outerRadius={90} dataKey="value" labelLine={false}>
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<SliceTooltip />} />
        </PieChart>
      </div>

      <div className="pie-charts__legend">
        {data.map((entry) => (
          <div key={entry.name} className="pie-charts__legend-item">
            <div className="pie-charts__legend-left">
              <span
                className="pie-charts__legend-dot"
                style={{ backgroundColor: entry.color }}
              />
              <span className="pie-charts__legend-name">{entry.name}</span>
            </div>
            <span className="pie-charts__legend-count">
              {entry.value}
              <span className="pie-charts__legend-pct">
                {total > 0 ? ` (${Math.round((entry.value / total) * 100)}%)` : ''}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="pie-charts">
      {renderChart('Class Roster Status', classStatusData, students.length)}
      {renderChart('GrepThink Registration', gtStatusData, students.length)}
    </div>
  );
};

export default PieCharts;
