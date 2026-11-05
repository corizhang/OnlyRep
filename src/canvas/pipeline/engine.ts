import type { CleanedTable } from '../../parser/clean';
import type {
  DataSource,
  NamedScalars,
  NodeOutput,
  PipelineGraph,
  PipelineNode,
  RunResult,
  ScalarValue,
  SourceRuntime,
} from '../types';
import { runNode, type NodeRunContext } from './nodes';

/**
 * DAG 引擎（ARCH §5.1）：
 * - Kahn 拓扑排序执行，写入前做环检测（PRD R2-05）；
 * - 表节点带指纹缓存，输入未变直接复用上次输出（PRD R2-04）；
 * - 标量节点两阶段执行，允许公式互相引用（拓扑序无关）。
 */

export interface EngineContext {
  sourceDefs: DataSource[];
  sources: Record<string, SourceRuntime>;
  /** 跨次运行的缓存（由 store 持有） */
  cache?: Map<string, { fp: string; out: NodeOutput }>;
}

/** 构造 source 节点输出（表/标量/多标量） */
function runSource(node: PipelineNode, ctx: EngineContext): NodeOutput {
  const sourceId = String(node.params.sourceId ?? '');
  const def = ctx.sourceDefs.find((s) => s.id === sourceId);
  if (!def) return { kind: 'error', message: '数据源已删除' };

  if (def.kind === 'constant') {
    return { kind: 'scalar', value: parseScalar(def.value) };
  }

  if (def.kind === 'form') {
    const values: NamedScalars = {};
    for (const e of def.entries) {
      const key = e.key.trim();
      if (key !== '') values[key] = parseScalar(e.value);
    }
    return { kind: 'scalars', values };
  }

  const rt = ctx.sources[sourceId];
  if (!rt || !rt.table) {
    return {
      kind: 'error',
      message: rt?.status === 'error' ? (rt.message ?? '解析失败') : '待导入数据文件',
    };
  }
  return { kind: 'table', table: rt.table };
}

/** 文本 → 数值/布尔/文本（数字带千分位也识别） */
export function parseScalar(raw: string): ScalarValue {
  const s = String(raw ?? '').trim();
  if (s === '') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  const n = Number(s.replace(/,/g, ''));
  if (Number.isFinite(n) && /^[+-]?[\d,]*\.?\d+$/.test(s)) return n;
  return s;
}

/** 求各节点指纹（表节点缓存 key） */
function fingerprintOf(node: PipelineNode, inputFps: string[], sourceVersion: string): string {
  const params = stableStringify(node.params);
  return hash(`${node.type}|${node.enabled}|${params}|${sourceVersion}|${inputFps.join(',')}`);
}

/** 稳定序列化（键排序，避免对象键序导致指纹漂移） */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** djb2 字符串哈希（缓存指纹用，无需密码学强度） */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** 拓扑排序；存在环时返回 { order: 已排序部分, cycle: 环上节点 id } */
export function topoSort(nodes: PipelineNode[]): { order: PipelineNode[]; cycle: string[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const indeg = new Map<string, number>();
  const outEdges = new Map<string, string[]>();

  for (const n of nodes) {
    indeg.set(n.id, 0);
    outEdges.set(n.id, []);
  }
  for (const n of nodes) {
    for (const input of n.inputs) {
      if (!byId.has(input)) continue; // 悬空输入忽略（数据源被删的降级路径）
      indeg.set(n.id, (indeg.get(n.id) ?? 0) + 1);
      outEdges.get(input)!.push(n.id);
    }
  }

  const queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order: PipelineNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(byId.get(id)!);
    for (const next of outEdges.get(id) ?? []) {
      const d = (indeg.get(next) ?? 1) - 1;
      indeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  if (order.length === nodes.length) return { order, cycle: [] };
  const cycle = nodes.filter((n) => !order.includes(n)).map((n) => n.id);
  return { order, cycle };
}

/** 若把 input 加到 nodeId 的输入里是否会成环（UI 建链前预检） */
export function wouldCreateCycle(graph: PipelineGraph, nodeId: string, inputId: string): boolean {
  if (nodeId === inputId) return true;
  // 从 inputId 反向追溯，能到 nodeId 即成环
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const stack = [inputId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === nodeId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const n = byId.get(cur);
    if (n) stack.push(...n.inputs);
  }
  return false;
}

/** 计算节点的上游链（沿 inputs 追溯，含自身），用于 UI「每源步骤链」展示 */
export function chainOf(graph: PipelineGraph, nodeId: string): PipelineNode[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const out: PipelineNode[] = [];
  const seen = new Set<string>();
  const visit = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const n = byId.get(id);
    if (!n) return;
    out.push(n);
    n.inputs.forEach(visit);
  };
  visit(nodeId);
  return out.reverse();
}

/** 运行整图 */
export function runGraph(graph: PipelineGraph, ctx: EngineContext): RunResult {
  const started = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const env: NamedScalars = {};
  const outputs: Record<string, NodeOutput> = {};
  const fps = new Map<string, string>();
  const cache = ctx.cache ?? new Map<string, { fp: string; out: NodeOutput }>();

  const warn = (msg: string): void => {
    if (!warnings.includes(msg)) warnings.push(msg);
  };

  const { order, cycle } = topoSort(graph.nodes);
  if (cycle.length > 0) {
    errors.push(`管道存在环形依赖（${cycle.length} 个节点未执行），请检查上游连线`);
  }

  const nodeCtx: NodeRunContext = { vars: env, warn };
  const formulaNodes: PipelineNode[] = [];

  // ---- 阶段 1：非公式节点 ----
  for (const node of order) {
    if (!node.enabled) {
      outputs[node.id] = { kind: 'error', message: '节点已停用' };
      continue;
    }
    if (node.type === 'formula') {
      formulaNodes.push(node);
      continue;
    }

    const inputOuts = node.inputs.map((id) => outputs[id]).filter(Boolean);
    const inputFps = node.inputs.map((id) => fps.get(id) ?? 'none');

    if (node.type === 'source') {
      const sourceId = String(node.params.sourceId ?? '');
      const def = ctx.sourceDefs.find((s) => s.id === sourceId);
      let fp: string;
      if (def && (def.kind === 'form' || def.kind === 'constant')) {
        // 标量源内容直接存在 def 中（无 runtime version），必须纳入指纹，否则改值后缓存命中旧输出
        fp = `src|${sourceId}|${stableStringify(def.kind === 'form' ? def.entries : def.value)}`;
      } else {
        const rt = ctx.sources[sourceId];
        fp = `src|${sourceId}|${rt?.version ?? 0}|${rt?.status ?? 'empty'}`;
      }
      const hit = cache.get(node.id);
      const out = hit && hit.fp === fp ? hit.out : runSource(node, ctx);
      cache.set(node.id, { fp, out });
      outputs[node.id] = out;
      fps.set(node.id, fp);
    } else {
      const fp = fingerprintOf(node, inputFps, '');
      const hit = cache.get(node.id);
      let out: NodeOutput;
      if (hit && hit.fp === fp) {
        out = hit.out;
      } else {
        out = runNode(node, inputOuts, nodeCtx);
        // 表节点才缓存（标量节点太便宜，且依赖 env 难以指纹化）
        if (out.kind === 'table') cache.set(node.id, { fp, out });
      }
      outputs[node.id] = out;
      fps.set(node.id, fp);
    }

    collectEnv(node, outputs[node.id], env, warn, errors);
  }

  // ---- 阶段 2：公式节点（可引用任意标量，多轮直到收敛） ----
  let pending = formulaNodes.filter((n) => n.enabled);
  let round = 0;
  while (pending.length > 0 && round < 6) {
    const still: PipelineNode[] = [];
    let progressed = false;
    for (const node of pending) {
      const expr = String(node.params.expr ?? '').trim();
      if (expr === '') {
        outputs[node.id] = { kind: 'error', message: '公式为空' };
        progressed = true;
        continue;
      }
      const out = runNode(node, [], nodeCtx);
      if (out.kind === 'error' && /不存在/.test(out.message) && round < 5) {
        still.push(node);
        continue;
      }
      outputs[node.id] = out;
      collectEnv(node, out, env, warn, errors);
      progressed = true;
    }
    if (!progressed) {
      for (const node of still) {
        outputs[node.id] = { kind: 'error', message: '公式引用的变量不存在' };
      }
      break;
    }
    pending = still;
    round += 1;
  }

  for (const node of graph.nodes) {
    if (!node.enabled) continue;
    const out = outputs[node.id];
    if (out && out.kind === 'error' && out.message !== '待导入数据文件') {
      errors.push(`「${node.name}」：${out.message}`);
    }
  }

  return { outputs, env, errors, warnings, ms: Date.now() - started };
}

/** 标量节点输出写入全局环境 */
function collectEnv(
  node: PipelineNode,
  out: NodeOutput,
  env: NamedScalars,
  warn: (m: string) => void,
  errors: string[],
): void {
  if (out.kind === 'scalar') {
    const name = node.name.trim();
    if (name === '') return;
    if (Object.prototype.hasOwnProperty.call(env, name)) {
      warn(`变量名「${name}」重复：「${node.name}」的输出覆盖了同名变量，被覆盖方的修改不会生效`);
    }
    env[name] = out.value;
  } else if (out.kind === 'scalars') {
    for (const [k, v] of Object.entries(out.values)) {
      if (Object.prototype.hasOwnProperty.call(env, k)) {
        warn(`变量名「${k}」重复：被「${node.name}」的输出覆盖，被覆盖方的修改不会生效`);
      }
      env[k] = v;
    }
  } else if (out.kind === 'error' && out.message !== '待导入数据文件') {
    // 错误已在末尾统一收集，这里只避免变量名缺失造成的静默
    void errors;
  }
}

/** 取某节点输出表的列名（UI 下拉/绑定选择器用） */
export function columnsOf(outputs: Record<string, NodeOutput>, nodeId: string): { key: string; label: string }[] {
  const out = outputs[nodeId];
  if (!out) return [];
  if (out.kind === 'table') return out.table.columns.map((c) => ({ key: c.key, label: c.rawName || c.key }));
  return [];
}

/** 可绑定为表格的节点 id 列表 */
export function tableNodeIds(graph: PipelineGraph, outputs: Record<string, NodeOutput>): string[] {
  return graph.nodes
    .filter((n) => {
      const out = outputs[n.id];
      return out && out.kind === 'table';
    })
    .map((n) => n.id);
}

export type { CleanedTable };
