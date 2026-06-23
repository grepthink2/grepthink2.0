import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import '@features/app/components/Roster/PieCharts.scss';

const IN_PROJECT_COLOR = '#018156';
const REGISTERED_NO_PROJECT_COLOR = '#F59E0B';
const NOT_REGISTERED_COLOR = '#DADADA';

interface ChartEntry {
  name: string;
  value: number;
  color: string;
}

interface SlicePayloadItem {
  name?: string;
  value?: number;
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

export interface ProjectMembershipChartProps {
  inProject: number;
  registeredNoProject: number;
  notRegistered: number;
}

const LEGEND_ENTRIES = [
  { key: 'inProject' as const, name: 'In a Project', color: IN_PROJECT_COLOR },
  {
    key: 'registeredNoProject' as const,
    name: 'Not in a Project, Registered',
    color: REGISTERED_NO_PROJECT_COLOR,
  },
  {
    key: 'notRegistered' as const,
    name: 'Not Registered in GrepThink',
    color: NOT_REGISTERED_COLOR,
  },
];

const ProjectMembershipChart: React.FC<ProjectMembershipChartProps> = ({
  inProject,
  registeredNoProject,
  notRegistered,
}) => {
  const counts: Record<string, number> = { inProject, registeredNoProject, notRegistered };
  const total = inProject + registeredNoProject + notRegistered;

  const chartData: ChartEntry[] = useMemo(
    () =>
      LEGEND_ENTRIES.map((e) => ({ name: e.name, value: counts[e.key], color: e.color })).filter(
        (entry) => entry.value > 0,
      ),
    [inProject, registeredNoProject, notRegistered],
  );

  return (
    <div className="pie-charts__card">
      <h3 className="pie-charts__card-title">Project Assignment</h3>

      <div className="pie-charts__chart-wrapper">
        <PieChart width={200} height={200}>
          <Pie data={chartData} cx={100} cy={100} outerRadius={90} dataKey="value" labelLine={false}>
            {chartData.map((entry, idx) => (
              <Cell key={idx} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<SliceTooltip />} />
        </PieChart>
      </div>

      <div className="pie-charts__legend">
        {LEGEND_ENTRIES.map((entry) => (
          <div key={entry.name} className="pie-charts__legend-item">
            <div className="pie-charts__legend-left">
              <span
                className="pie-charts__legend-dot"
                style={{ backgroundColor: entry.color }}
              />
              <span className="pie-charts__legend-name">{entry.name}</span>
            </div>
            <span className="pie-charts__legend-count">
              {counts[entry.key]}
              <span className="pie-charts__legend-pct">
                {total > 0 ? ` (${Math.round((counts[entry.key] / total) * 100)}%)` : ''}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProjectMembershipChart;
