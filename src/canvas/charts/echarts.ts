import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, GaugeChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
  TitleComponent,
  GraphicComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

/**
 * ECharts 按需注册（ARCH D21 / R10-08）。
 * 铁律：只允许从这里 import echarts，禁止 `import * as echarts from 'echarts'` 整包引入；
 * 渲染器固定 SVG —— canvas 位图经 html-to-image 导出会糊（R10-07）。
 */

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GaugeChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
  TitleComponent,
  GraphicComponent,
  SVGRenderer,
]);

export { echarts };
export type EChartsInstance = echarts.ECharts;
