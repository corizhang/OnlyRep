import type { CleanRow } from '../../parser/clean';
import type { CanvasBlock, CanvasConfig, NamedScalars } from '../types';
import type { FormulaVariable } from '../formula/variableEnv';
import type { ResolveContext } from './resolve';
import { resolveTable } from './resolve';
import { totalNumberOf } from '../blocks/tableTotal';

/**
 * 合计行变量注入（PRD R4-07 增补）：
 * 把每个数据表格块合计行的数值注入变量环境，命名 `表格标题_列名`，
 * 供文本块 {{表达式}} 与公式编辑器直接引用，避免更新说明文字时手抄数字。
 * 口径与渲染完全一致：走同一份 totalNumberOf（含加权/智能规则），含 maxRows 截断。
 */

/** 遍历所有区块（含 row 子块） */
function* walkBlocks(blocks: CanvasBlock[]): Generator<CanvasBlock> {
  for (const b of blocks) {
    yield b;
    if (b.type === 'row') yield* walkBlocks(b.config.children);
  }
}

export function collectBlockTotalVars(
  config: CanvasConfig,
  ctx: ResolveContext,
): { env: NamedScalars; vars: FormulaVariable[] } {
  const env: NamedScalars = {};
  const vars: FormulaVariable[] = [];
  const used = new Set<string>();
  for (const b of walkBlocks(config.blocks)) {
    if (b.type !== 'dataTable' || !b.config.totalRow) continue;
    const title = b.config.title || '表格';
    const resolved = resolveTable(b.config.table, ctx);
    if (!('table' in resolved)) continue; // 失联时不注入，不报错（渲染处已有占位提示）
    const all: CleanRow[] = resolved.table.rows;
    const rows = b.config.maxRows > 0 ? all.slice(0, b.config.maxRows) : all;
    for (const c of b.config.columns) {
      const v = totalNumberOf(c, rows);
      if (typeof v !== 'number') continue;
      // 标题+列名冲突（如两个表格同名同字段）→ 按区块顺序加序号：表格_列、表格2_列、表格3_列…
      const label = c.label || c.col;
      let name = `${title}_${label}`;
      if (used.has(name)) {
        let n = 2;
        while (used.has(`${title}${n}_${label}`)) n += 1;
        name = `${title}${n}_${label}`;
      }
      used.add(name);
      env[name] = v;
      vars.push({
        name,
        group: '合计',
        value: v,
        hint: `合计行 · ${title} · ${label}`,
      });
    }
  }
  return { env, vars };
}
