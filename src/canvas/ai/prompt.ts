import type { CanvasConfig, DataSource } from '../types';
import type { SourceRuntime } from '../types';

/**
 * AI 生成提示词构建（B 方案核心）：
 * 给 OpenAI 兼容端点的 system+user 消息。设计要点：
 * - schema 摘要 + 一个完整 few-shot 例子（强约束输出形态）
 * - 数据上下文只给列结构（列名+类型）；样本行需用户显式勾选才注入
 * - 强令只输出 JSON（生成侧另有容错抽取）
 */

const SCHEMA_DOC = `
你将为「OnlyRep 数据可视化日报工作台」生成一份画布配置 JSON（CanvasConfig）。只输出 JSON，不要任何解释。

## 顶层结构
{
  "version": 2,
  "title": "日报标题",
  "width": 750,
  "fontSize": "medium",          // small|medium|large
  "theme": { "accent": "#2563eb", "bg": "#f6f7f9" },  // accent 主题色，bg 页面底色
  "dataSources": [ ... ],
  "pipeline": { "nodes": [ ... ] },
  "blocks": [ ... ]
}

## 数据源 dataSources[]
- 手填表（数据直接写在配置里，AI 造数用这个）：
  { "id": "ds1", "name": "渠道数据", "kind": "manualTable", "columns": ["渠道","新增"], "rows": [["公众号", 120], ["短信", 85]] }  // 注意：columns/rows 直接挂在源上，不要套 table 字段
- 常量：{ "id": "c1", "name": "全年目标", "kind": "constant", "value": 10000 }
（若用户已导入数据，优先用「用户已有数据源」的 id 直接引用，不要重复创建）

## 管道节点 pipeline.nodes[]（DAG，inputs 指上游 id）
- 源节点：{ "id": "n_src", "type": "source", "name": "渠道数据", "inputs": [], "params": { "sourceId": "ds1" }, "enabled": true }
- 排序取TopN：{ "type": "sortTopN", "params": { "col": "新增", "dir": "desc", "topN": 10 } }
- 筛选：{ "type": "filter", "params": { "col": "渠道", "op": "contains", "value": "公众号" } }  // op: eq|ne|contains|gt|lt|empty|notEmpty
- 分组汇总：{ "type": "groupAgg", "params": { "dim": "渠道", "metrics": [{ "col": "新增", "method": "sum", "as": "新增合计" }] } }  // method: sum|avg|count|countDistinct|max|min
- 取数（产出标量变量，供画布绑定）：{ "type": "scalarOut", "name": "公众号新增", "params": { "col": "新增", "method": "sum" } }
- 公式：{ "type": "formula", "name": "完成率", "params": { "expr": "公众号新增 / 全年目标 * 100" } }  // 无上游产出标量；变量名=其他标量节点的 name

## 画布块 blocks[]
- 标题/文案：{ "id": "b1", "type": "text", "config": { "content": "当日概览", "variant": "h2" } }  // variant: title|h1|h2|body|note
- KPI 卡：{ "type": "kpiCard", "config": { "label": "公众号新增", "value": { "kind": "node", "nodeRef": "n_kpi" }, "unit": "户", "note": "较昨日 +12%", "noteTone": "secondary" } }
- 目标进度：{ "type": "goalProgress", "config": { "label": "全年目标完成率", "ratio": { "kind": "node", "nodeRef": "n_rate" }, "decimals": 1 } }  // ratio 为 0~1 的小数
- 图表：{ "type": "chart", "config": { "title": "各渠道新增", "chartType": "bar", "table": { "nodeRef": "n_tbl" }, "dimension": "渠道", "metrics": ["新增"], "horizontal": false, "height": 240 } }  // chartType: bar|line|pie|funnel|radar
- 数据表：{ "type": "dataTable", "config": { "title": "明细", "table": { "nodeRef": "n_tbl" }, "maxRows": 10, "columns": [] } }
- 排行榜：{ "type": "rankList", "config": { "title": "新增排行", "table": { "nodeRef": "n_tbl" }, "dimension": "渠道", "metric": "新增", "unit": "户", "maxRows": 10 } }
- 分栏容器（多列布局，columns 内可放上面的块）：{ "type": "row", "config": { "columns": [ { "blocks": [ ... ] }, { "blocks": [ ... ] } ] } }
- 分隔线：{ "type": "divider", "config": {} }

## 规则
1. 所有 id 用可读英文短名（如 n_src / n_kpi / b_title），nodeRef 必须指向真实存在的节点 id
2. 文本内容支持 {{变量名}} 引用标量节点 name（会在导出时替换成数值）
3. KPI/图表/表格必须先有对应管道节点，再绑定其 id
4. 布局从上到下组织；两列对比用 row 容器
5. 数字字段必须是数字不是字符串
`.trim();

/** few-shot 完整例子（精简但结构完整） */
const EXAMPLE = JSON.stringify(
  {
    version: 2,
    title: '渠道新增日报',
    width: 750,
    fontSize: 'medium',
    theme: { accent: '#2563eb', bg: '#f6f7f9' },
    dataSources: [
      { id: 'ds_ch', name: '渠道数据', kind: 'manualTable', columns: ['渠道', '新增'], rows: [['公众号', 120], ['短信', 85], ['企微', 60]] },
      { id: 'c_goal', name: '全年目标', kind: 'constant', value: 10000 },
    ],
    pipeline: {
      nodes: [
        { id: 'n_src', type: 'source', name: '渠道数据', inputs: [], params: { sourceId: 'ds_ch' }, enabled: true },
        { id: 'n_sum', type: 'scalarOut', name: '总新增', inputs: ['n_src'], params: { col: '新增', method: 'sum' }, enabled: true },
        { id: 'n_rate', type: 'formula', name: '完成率', inputs: [], params: { expr: '总新增 / 全年目标' }, enabled: true },
        { id: 'n_top', type: 'sortTopN', name: '排序', inputs: ['n_src'], params: { col: '新增', dir: 'desc', topN: 10 }, enabled: true },
      ],
    },
    blocks: [
      { id: 'b_t', type: 'text', config: { content: '渠道新增日报', variant: 'title' } },
      {
        id: 'b_row',
        type: 'row',
        config: {
          columns: [
            { blocks: [{ id: 'b_k1', type: 'kpiCard', config: { label: '总新增', value: { kind: 'node', nodeRef: 'n_sum' }, unit: '户', note: '', noteTone: 'secondary' } }] },
            { blocks: [{ id: 'b_g', type: 'goalProgress', config: { label: '全年目标完成率', ratio: { kind: 'node', nodeRef: 'n_rate' }, decimals: 1 } }] },
          ],
        },
      },
      { id: 'b_c', type: 'chart', config: { title: '各渠道新增', chartType: 'bar', table: { nodeRef: 'n_top' }, dimension: '渠道', metrics: ['新增'], horizontal: false, height: 240 } },
    ],
  },
  null,
  1,
);

/** 数据上下文：列结构（默认）+ 可选样本行 */
function dataContext(dataSources: DataSource[], sources: Record<string, SourceRuntime>, sendSampleRows: boolean): string {
  const parts: string[] = [];
  for (const d of dataSources) {
    const rt = sources[d.id];
    const table = rt?.table;
    if (!table || table.columns.length === 0) continue;
    const cols = table.columns.map((c) => `${c.rawName || c.key}(${c.type === 'number' ? '数值' : '文本'})`).join('、');
    let line = `- 数据源「${d.name}」(id=${d.id})：${table.rows.length} 行，列：${cols}`;
    if (sendSampleRows && table.rows.length > 0) {
      const sample = table.rows.slice(0, 3).map((r) => table.columns.map((c) => String(r[c.key] ?? '')).join(' | '));
      line += `\n  样本：\n  ${sample.join('\n  ')}`;
    }
    parts.push(line);
  }
  if (parts.length === 0) return '用户尚未导入数据。请用 manualTable 手填表数据源造合理的示例数据。';
  return `用户已有数据源（直接引用它们的 id 建 source 节点，不要重复建数据源）：\n${parts.join('\n')}`;
}

export interface AiMessages {
  system: string;
  user: string;
}

export function buildAiMessages(
  description: string,
  dataSources: DataSource[],
  sources: Record<string, SourceRuntime>,
  sendSampleRows: boolean,
): AiMessages {
  const ctx = dataContext(dataSources, sources, sendSampleRows);
  return {
    system: SCHEMA_DOC,
    user: `【数据上下文】\n${ctx}\n\n【完整配置示例】\n${EXAMPLE}\n\n【用户需求】\n${description}\n\n请生成 CanvasConfig JSON（只输出 JSON 本体，不要 markdown 代码围栏，不要任何解释）。`,
  };
}
