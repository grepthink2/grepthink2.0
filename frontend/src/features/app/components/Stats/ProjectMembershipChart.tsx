import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import '@features/app/components/Roster/PieCharts.scss';

const IN_PROJECT_COLOR = '#018156';
const NOT_IN_PROJECT_COLOR = '#DADADA';

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
  notInProject: number;
}

const ProjectMembershipChart: React.FC<ProjectMembershipChartProps> = ({
  inProject,
  notInProject,
}) => {
  const total = inProject + notInProject;

  const chartData: ChartEntry[] = useMemo(
    () =>
      [
        { name: 'In a Project', value: inProject, color: IN_PROJECT_COLOR },
        { name: 'Not in a Project', value: notInProject, color: NOT_IN_PROJECT_COLOR },
      ].filter((entry) => entry.value > 0),
    [inProject, notInProject],
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
        {[
          { name: 'In a Project', value: inProject, color: IN_PROJECT_COLOR },
          { name: 'Not in a Project', value: notInProject, color: NOT_IN_PROJECT_COLOR },
        ].map((entry) => (
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
};

export default ProjectMembershipChart;
