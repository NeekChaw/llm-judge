'use client';

/**
 * 分析台图表组件库
 * 基于Recharts构建，提供各类交互式数据可视化组件
 */

import React from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';

// 图表颜色主题
export const CHART_COLORS = {
  primary: ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
  gradient: {
    blue: { start: '#3b82f6', end: '#1e40af' },
    purple: { start: '#8b5cf6', end: '#6d28d9' },
    green: { start: '#10b981', end: '#065f46' },
    orange: { start: '#f59e0b', end: '#d97706' }
  }
};

// 通用图表属性
interface BaseChartProps {
  data: any[];
  loading?: boolean;
  height?: number;
  className?: string;
}

// 自定义Tooltip组件
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
        <p className="text-sm font-medium text-gray-900 mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center space-x-2">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-sm text-gray-600">
              {entry.name}: <span className="font-medium">{entry.value}</span>
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// 饼状图专用Tooltip组件
const PieTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
        <div className="flex items-center space-x-2">
          <div 
            className="w-3 h-3 rounded-full" 
            style={{ backgroundColor: payload[0].color }}
          />
          <span className="text-sm text-gray-600">
            <span className="font-medium">{data.template || data.name || '未知'}</span>
            <br />
            <span className="text-xs">数量: {payload[0].value}</span>
          </span>
        </div>
      </div>
    );
  }
  return null;
};

/**
 * 趋势图表组件 - 支持折线图和面积图
 */
export interface TrendChartProps extends BaseChartProps {
  xKey: string;
  yKey: string;
  title?: string;
  color?: string;
  showArea?: boolean;
}

export function TrendChart({
  data,
  xKey,
  yKey,
  title,
  color = CHART_COLORS.info,
  showArea = false,
  loading = false,
  height = 400,
  className = ''
}: TrendChartProps) {
  if (loading) {
    return (
      <div className={`flex items-center justify-center h-${height} ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className={className}>
      {title && <h3 className="text-lg font-semibold mb-4">{title}</h3>}
      <ResponsiveContainer width="100%" height={height}>
        {showArea ? (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey={xKey} 
              stroke="#666"
              fontSize={12}
            />
            <YAxis stroke="#666" fontSize={12} />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey={yKey}
              stroke={color}
              fill={color}
              fillOpacity={0.3}
              strokeWidth={2}
            />
          </AreaChart>
        ) : (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey={xKey} 
              stroke="#666"
              fontSize={12}
            />
            <YAxis stroke="#666" fontSize={12} />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey={yKey}
              stroke={color}
              strokeWidth={2}
              dot={{ fill: color, r: 4 }}
              activeDot={{ r: 6, stroke: color, strokeWidth: 2 }}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/**
 * 模型对比柱状图组件
 */
export interface BarChartProps extends BaseChartProps {
  xKey: string;
  yKey: string;
  title?: string;
  color?: string;
}

export function ModelComparisonChart({
  data,
  xKey,
  yKey,
  title,
  color = CHART_COLORS.info,
  loading = false,
  height = 400,
  className = ''
}: BarChartProps) {
  if (loading) {
    return (
      <div className={`flex items-center justify-center h-${height} ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // 自定义标签渲染函数，在柱状图上方显示分数
  const renderCustomLabel = (props: any) => {
    const { x, y, width, value } = props;
    return (
      <text 
        x={x + width / 2} 
        y={y - 5} 
        fill="#374151" 
        textAnchor="middle" 
        fontSize="12"
        fontWeight="500"
      >
        {typeof value === 'number' ? value.toFixed(2) : value}
      </text>
    );
  };

  return (
    <div className={className}>
      {title && <h3 className="text-lg font-semibold mb-4">{title}</h3>}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 40, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis 
            dataKey={xKey} 
            stroke="#666"
            fontSize={12}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis stroke="#666" fontSize={12} />
          <Tooltip content={<CustomTooltip />} />
          <Bar 
            dataKey={yKey} 
            fill={color}
            radius={[4, 4, 0, 0]}
            label={renderCustomLabel}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * 雷达图组件 - 用于多维度对比
 */
export interface RadarChartProps extends BaseChartProps {
  metrics: string[];
  title?: string;
}

export function ModelRadarChart({
  data,
  metrics,
  title,
  loading = false,
  height = 400,
  className = ''
}: RadarChartProps) {
  if (loading) {
    return (
      <div className={`flex items-center justify-center h-${height} ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className={className}>
      {title && <h3 className="text-lg font-semibold mb-4">{title}</h3>}
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={data}>
          <PolarGrid stroke="#e0e0e0" />
          <PolarAngleAxis dataKey="dimension" fontSize={12} />
          <PolarRadiusAxis 
            angle={0} 
            domain={[0, 100]} 
            fontSize={10}
            stroke="#666"
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {metrics.map((metric, index) => (
            <Radar
              key={metric}
              name={metric}
              dataKey={metric}
              stroke={CHART_COLORS.primary[index % CHART_COLORS.primary.length]}
              fill={CHART_COLORS.primary[index % CHART_COLORS.primary.length]}
              fillOpacity={0.2}
              strokeWidth={2}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * 饼图组件 - 用于展示分布情况
 */
export interface PieChartProps extends BaseChartProps {
  nameKey: string;
  valueKey: string;
  title?: string;
  showLabel?: boolean;
}

export function DistributionPieChart({
  data,
  nameKey,
  valueKey,
  title,
  showLabel = true,
  loading = false,
  height = 300,
  className = ''
}: PieChartProps) {
  if (loading) {
    return (
      <div className={`flex items-center justify-center h-${height} ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // 计算标签位置
  const renderLabel = (entry: any) => {
    if (!showLabel) return '';
    const percent = ((entry.value / data.reduce((sum, item) => sum + item[valueKey], 0)) * 100).toFixed(1);
    return `${entry[nameKey]} (${percent}%)`;
  };

  // 自定义图例渲染器
  const renderLegend = (props: any) => {
    const { payload } = props;
    return (
      <ul className="flex flex-wrap justify-center gap-4 mt-4">
        {payload.map((entry: any, index: number) => (
          <li key={`legend-${index}`} className="flex items-center space-x-2">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-sm text-gray-600">
              {/* 使用原始数据中的nameKey字段作为图例标签 */}
              {data[index] ? data[index][nameKey] : entry.value}
            </span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className={className}>
      {title && <h3 className="text-lg font-semibold mb-4">{title}</h3>}
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderLabel}
            outerRadius={80}
            fill="#8884d8"
            dataKey={valueKey}
          >
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={CHART_COLORS.primary[index % CHART_COLORS.primary.length]} 
              />
            ))}
          </Pie>
          <Tooltip content={<PieTooltip />} />
          <Legend content={renderLegend} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * 指标卡片组件 - 用于展示关键指标
 */
export interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeType?: 'increase' | 'decrease' | 'neutral';
  icon?: React.ReactNode;
  description?: string;
  loading?: boolean;
  className?: string;
}

export function MetricCard({
  title,
  value,
  change,
  changeType = 'neutral',
  icon,
  description,
  loading = false,
  className = ''
}: MetricCardProps) {
  if (loading) {
    return (
      <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded mb-2"></div>
          <div className="h-8 bg-gray-200 rounded mb-2"></div>
          <div className="h-3 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  const changeColors = {
    increase: 'text-green-600',
    decrease: 'text-red-600',
    neutral: 'text-gray-600'
  };

  return (
    <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {change !== undefined && (
            <p className={`text-sm mt-1 ${changeColors[changeType]}`}>
              {changeType === 'increase' && '+'}
              {change}% vs 上期
            </p>
          )}
          {description && (
            <p className="text-xs text-gray-500 mt-2">{description}</p>
          )}
        </div>
        {icon && (
          <div className="ml-4 flex-shrink-0">
            <div className="w-8 h-8 text-gray-400">
              {icon}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 模型性能热力图组件
 * 用于展示模型在不同维度上的表现
 */
export interface HeatmapProps extends BaseChartProps {
  rowKey: string; // 行键 (如模型名称)
  colKey: string; // 列键 (如维度名称)
  valueKey: string; // 值键 (如得分)
  title?: string;
}

export function ModelPerformanceHeatmap({
  data,
  rowKey,
  colKey,
  valueKey,
  title,
  loading = false,
  height = 400,
  className = ''
}: HeatmapProps) {
  if (loading) {
    return (
      <div className={`flex items-center justify-center h-${height} ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // 构建热力图数据矩阵
  const heatmapData = React.useMemo(() => {
    const rows = [...new Set(data.map(item => item[rowKey]))];
    const cols = [...new Set(data.map(item => item[colKey]))];
    
    return rows.map(row => {
      const rowData: any = { [rowKey]: row };
      cols.forEach(col => {
        const item = data.find(d => d[rowKey] === row && d[colKey] === col);
        rowData[col] = item ? item[valueKey] : null;
      });
      return rowData;
    });
  }, [data, rowKey, colKey, valueKey]);

  const columns = [...new Set(data.map(item => item[colKey]))];

  // 获取最大值用于颜色映射
  const maxValue = Math.max(...data.map(item => item[valueKey] || 0));

  return (
    <div className={className}>
      {title && <h3 className="text-lg font-semibold mb-4">{title}</h3>}
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-500"></th>
              {columns.map(col => (
                <th key={col} className="px-4 py-2 text-center text-sm font-medium text-gray-500">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmapData.map((row, index) => (
              <tr key={index}>
                <td className="px-4 py-2 text-sm font-medium text-gray-900">
                  {row[rowKey]}
                </td>
                {columns.map(col => {
                  const value = row[col];
                  const intensity = value ? (value / maxValue) : 0;
                  const bgColor = value ? 
                    `rgba(59, 130, 246, ${0.1 + intensity * 0.8})` : 
                    'rgba(229, 231, 235, 0.3)';
                  
                  return (
                    <td 
                      key={col} 
                      className="px-4 py-2 text-center text-sm"
                      style={{ backgroundColor: bgColor }}
                    >
                      {value ? value.toFixed(1) : '-'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * 时间序列对比图组件
 * 支持多个系列的对比分析
 */
export interface TimeSeriesComparisonProps extends BaseChartProps {
  xKey: string;
  series: Array<{
    key: string;
    name: string;
    color?: string;
  }>;
  title?: string;
}

export function TimeSeriesComparison({
  data,
  xKey,
  series,
  title,
  loading = false,
  height = 400,
  className = ''
}: TimeSeriesComparisonProps) {
  if (loading) {
    return (
      <div className={`flex items-center justify-center h-${height} ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className={className}>
      {title && <h3 className="text-lg font-semibold mb-4">{title}</h3>}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis 
            dataKey={xKey} 
            stroke="#666"
            fontSize={12}
          />
          <YAxis stroke="#666" fontSize={12} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {series.map((serie, index) => (
            <Line
              key={serie.key}
              type="monotone"
              dataKey={serie.key}
              name={serie.name}
              stroke={serie.color || CHART_COLORS.primary[index % CHART_COLORS.primary.length]}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * 相关性分析散点图
 */
export interface CorrelationScatterProps extends BaseChartProps {
  xKey: string;
  yKey: string;
  sizeKey?: string; // 可选的气泡大小
  colorKey?: string; // 可选的颜色分组
  title?: string;
}

export function CorrelationScatter({
  data,
  xKey,
  yKey,
  sizeKey,
  colorKey,
  title,
  loading = false,
  height = 400,
  className = ''
}: CorrelationScatterProps) {
  if (loading) {
    return (
      <div className={`flex items-center justify-center h-${height} ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className={className}>
      {title && <h3 className="text-lg font-semibold mb-4">{title}</h3>}
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis 
            dataKey={xKey} 
            type="number"
            stroke="#666"
            fontSize={12}
          />
          <YAxis 
            dataKey={yKey}
            type="number"
            stroke="#666" 
            fontSize={12} 
          />
          <Tooltip content={<CustomTooltip />} />
          <Scatter 
            dataKey={yKey} 
            fill={CHART_COLORS.info}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}