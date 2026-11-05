import { useState } from 'react';
import type { ReactNode } from 'react';
import { useRankStore } from '../store/useRankStore';
import { PRESET_TEMPLATES, type TemplateId } from '../constants/templates';
import {
  createRankListBlockConfig,
  newBlockId,
  TABLE_COL_DEFAULT_ALIGN,
  TABLE_COL_IDS,
} from '../utils/blocks';
import { normalizeImage } from '../utils/image';
import type {
  BadgeShape,
  BlockAlign,
  BlockConfig,
  BlockType,
  DividerBlockConfig,
  ImageBlockConfig,
  PosterBlock,
  RankListBlockConfig,
  RankListVariant,
  TableColAlign,
  TableColId,
  TextBlockConfig,
  TextRole,
  Top1Icon,
} from '../types';

/**
 * 版式编辑面板（区块化低代码改造）：
 * ① 模板：4 套预设一键套用（覆盖前 confirm）；
 * ② 流式区块：列表（选中展开配置）+ 上移/下移/删除 + 添加菜单；
 * ③ 悬浮层：独立小节，x/y 百分比坐标；
 * ④ 榜单字段：次要字段 / 上期值列（自原展示设置面板迁移保留）。
 * 编辑器 UI 用 Tailwind；海报区渲染仍全部 inline style（PreviewBoard）。
 */

const BLOCK_META: Record<BlockType, { icon: string; label: string }> = {
  text: { icon: '文', label: '文本' },
  image: { icon: '图', label: '图片' },
  rankList: { icon: '榜', label: '榜单' },
  divider: { icon: '—', label: '分隔线' },
};

const VARIANT_LABEL: Record<RankListVariant, string> = {
  long: '长图',
  twoColumn: '双列',
  paged: '分页',
  table: '表格',
};

const TABLE_COL_LABEL: Record<TableColId, string> = {
  rank: '名次',
  name: '名称',
  secondary: '次要字段',
  value: '数值',
};

const TOP1_ICON_LABEL: Record<Top1Icon, string> = {
  auto: '跟随全局',
  crown: '皇冠',
  medal: '奖牌',
  trophy: '奖杯',
  none: '无',
};

const ALIGN_LABEL: Record<TableColAlign, string> = { left: '左', center: '中', right: '右' };

const ROLE_LABEL: Record<TextRole, string> = {
  title: '标题',
  subtitle: '副标题',
  body: '正文',
  note: '说明',
  signature: '落款',
};

/** 新建区块的默认配置 */
function createBlock(type: BlockType): PosterBlock {
  switch (type) {
    case 'text':
      return {
        id: newBlockId(),
        type,
        config: {
          content: '新文本',
          role: 'body',
          fontSizeScale: 0.95,
          bold: false,
          align: 'left',
          colorMode: 'theme',
          customColor: '',
        },
      };
    case 'image':
      return {
        id: newBlockId(),
        type,
        config: { src: null, widthPct: 50, align: 'center', borderRadius: 8 },
      };
    case 'rankList':
      return {
        id: newBlockId(),
        type,
        config: createRankListBlockConfig('long', 10),
      };
    case 'divider':
      return {
        id: newBlockId(),
        type,
        config: { colorMode: 'theme', customColor: '', thickness: 2, marginY: 12 },
      };
  }
}

/** 区块列表行摘要文本 */
function blockSummary(b: PosterBlock): string {
  switch (b.type) {
    case 'text': {
      const c = b.config as TextBlockConfig;
      return `${ROLE_LABEL[c.role]}：${c.content.slice(0, 12) || '（空）'}`;
    }
    case 'image': {
      const c = b.config as ImageBlockConfig;
      return c.src !== null ? `图片（宽 ${c.widthPct}%）` : '图片（未上传）';
    }
    case 'rankList': {
      const c = b.config as RankListBlockConfig;
      return `榜单（${VARIANT_LABEL[c.variant]}）`;
    }
    case 'divider':
      return '分隔线';
  }
}

export default function BlockEditorPanel() {
  const config = useRankStore((s) => s.config);
  const patchConfig = useRankStore((s) => s.patchConfig);
  const rawTable = useRankStore((s) => s.rawTable);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [imgError, setImgError] = useState('');

  if (!rawTable) return null;

  const input = 'w-full rounded border border-slate-300 px-2 py-1 text-xs';
  const label = 'mb-1 block font-medium text-slate-600';
  const smallBtn =
    'shrink-0 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-500 hover:border-blue-300 hover:text-blue-600 disabled:opacity-30';
  /** 分段按钮（选中态高亮），用于行样式/徽章形状/列宽模式等多选一 */
  const optBtn = (active: boolean): string =>
    `flex-1 rounded border px-1 py-1 text-[11px] ${
      active
        ? 'border-blue-400 bg-blue-50 font-medium text-blue-600'
        : 'border-slate-200 bg-white text-slate-500 hover:border-blue-300'
    }`;

  // ---- 区块列表操作 ----
  const moveBlock = (isFloat: boolean, id: string, dir: -1 | 1): void => {
    const list = isFloat ? config.floats : config.blocks;
    const idx = list.findIndex((b) => b.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= list.length) return;
    const arr = [...list];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    patchConfig(isFloat ? { floats: arr } : { blocks: arr });
  };

  const removeBlock = (isFloat: boolean, id: string): void => {
    if (isFloat) patchConfig({ floats: config.floats.filter((b) => b.id !== id) });
    else patchConfig({ blocks: config.blocks.filter((b) => b.id !== id) });
    if (selectedId === id) setSelectedId(null);
  };

  const addBlock = (type: BlockType, isFloat: boolean): void => {
    const block = createBlock(type);
    if (isFloat) patchConfig({ floats: [...config.floats, block] });
    else patchConfig({ blocks: [...config.blocks, block] });
    setSelectedId(block.id);
    setShowAddMenu(false);
  };

  const patchBlockConfig = (isFloat: boolean, id: string, patch: Partial<BlockConfig>): void => {
    const list = isFloat ? config.floats : config.blocks;
    const arr = list.map((b) =>
      b.id === id ? { ...b, config: { ...b.config, ...patch } as BlockConfig } : b,
    );
    patchConfig(isFloat ? { floats: arr } : { blocks: arr });
  };

  const patchBlockMeta = (isFloat: boolean, id: string, patch: Partial<PosterBlock>): void => {
    const list = isFloat ? config.floats : config.blocks;
    const arr = list.map((b) => (b.id === id ? { ...b, ...patch } : b));
    patchConfig(isFloat ? { floats: arr } : { blocks: arr });
  };

  const onBlockImageFile = async (
    isFloat: boolean,
    id: string,
    file: File | undefined,
  ): Promise<void> => {
    setImgError('');
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      setImgError('仅支持 jpg / png 图片');
      return;
    }
    try {
      const { dataUrl } = await normalizeImage(file);
      patchBlockConfig(isFloat, id, { src: dataUrl });
    } catch {
      setImgError('图片读取失败，请重试');
    }
  };

  const applyTemplate = (id: TemplateId): void => {
    const tpl = PRESET_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    if (!window.confirm(`套用模板「${tpl.name}」将覆盖当前区块结构，确定？`)) return;
    const structure = tpl.build();
    patchConfig({ blocks: structure.blocks, floats: structure.floats });
    setSelectedId(null);
  };

  // ---- 配置表单（按 config 类型分发；选中区块展开） ----
  const renderConfigForm = (b: PosterBlock, isFloat: boolean): ReactNode => {
    const form = (() => {
      switch (b.type) {
        case 'text': {
          const c = b.config as TextBlockConfig;
          return (
            <div className="space-y-2">
              <label className="block">
                <span className={label}>内容</span>
                <textarea
                  value={c.content}
                  rows={2}
                  onChange={(e) => patchBlockConfig(isFloat, b.id, { content: e.target.value })}
                  className={input}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={label}>角色</span>
                  <select
                    value={c.role}
                    onChange={(e) =>
                      patchBlockConfig(isFloat, b.id, { role: e.target.value as TextRole })
                    }
                    className={input}
                  >
                    {(Object.keys(ROLE_LABEL) as TextRole[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={label}>字号倍数</span>
                  <input
                    type="number"
                    min={0.3}
                    max={5}
                    step={0.1}
                    value={c.fontSizeScale}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v >= 0.3) {
                        patchBlockConfig(isFloat, b.id, { fontSizeScale: Math.min(5, v) });
                      }
                    }}
                    className={input}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={label}>对齐</span>
                  <select
                    value={c.align}
                    onChange={(e) =>
                      patchBlockConfig(isFloat, b.id, { align: e.target.value as BlockAlign })
                    }
                    className={input}
                  >
                    <option value="left">左</option>
                    <option value="center">中</option>
                    <option value="right">右</option>
                  </select>
                </label>
                <label className="flex cursor-pointer items-end gap-2 pb-1">
                  <input
                    type="checkbox"
                    checked={c.bold}
                    onChange={(e) => patchBlockConfig(isFloat, b.id, { bold: e.target.checked })}
                  />
                  <span>加粗</span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={label}>颜色</span>
                  <select
                    value={c.colorMode}
                    onChange={(e) =>
                      patchBlockConfig(isFloat, b.id, {
                        colorMode: e.target.value as 'theme' | 'custom',
                      })
                    }
                    className={input}
                  >
                    <option value="theme">跟随主题</option>
                    <option value="custom">自定义</option>
                  </select>
                </label>
                {c.colorMode === 'custom' && (
                  <label className="block">
                    <span className={label}>自定义色</span>
                    <input
                      type="color"
                      value={c.customColor || '#1e293b'}
                      onChange={(e) =>
                        patchBlockConfig(isFloat, b.id, { customColor: e.target.value })
                      }
                      className="h-7 w-full cursor-pointer rounded border border-slate-300"
                    />
                  </label>
                )}
              </div>
            </div>
          );
        }
        case 'image': {
          const c = b.config as ImageBlockConfig;
          return (
            <div className="space-y-2">
              <div>
                <span className={label}>图片（自动压缩）</span>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={(e) => {
                      void onBlockImageFile(isFloat, b.id, e.target.files?.[0]);
                      e.target.value = '';
                    }}
                    className="w-full text-slate-500"
                  />
                  {c.src !== null && (
                    <button
                      type="button"
                      onClick={() => patchBlockConfig(isFloat, b.id, { src: null })}
                      className="shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-slate-500 hover:border-red-300 hover:text-red-600"
                    >
                      移除
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <span className={label}>宽度 %</span>
                  <input
                    type="number"
                    min={10}
                    max={100}
                    step={1}
                    value={c.widthPct}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) {
                        patchBlockConfig(isFloat, b.id, {
                          widthPct: Math.min(100, Math.max(10, Math.round(v))),
                        });
                      }
                    }}
                    className={input}
                  />
                </label>
                <label className="block">
                  <span className={label}>对齐</span>
                  <select
                    value={c.align}
                    onChange={(e) =>
                      patchBlockConfig(isFloat, b.id, { align: e.target.value as BlockAlign })
                    }
                    className={input}
                  >
                    <option value="left">左</option>
                    <option value="center">中</option>
                    <option value="right">右</option>
                  </select>
                </label>
                <label className="block">
                  <span className={label}>圆角 px</span>
                  <input
                    type="number"
                    min={0}
                    max={48}
                    step={1}
                    value={c.borderRadius}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) {
                        patchBlockConfig(isFloat, b.id, {
                          borderRadius: Math.min(48, Math.max(0, Math.round(v))),
                        });
                      }
                    }}
                    className={input}
                  />
                </label>
              </div>
            </div>
          );
        }
        case 'rankList': {
          const c = b.config as RankListBlockConfig;
          const isTable = c.variant === 'table';
          const patchTable = (patch: Partial<RankListBlockConfig['table']>): void =>
            patchBlockConfig(isFloat, b.id, { table: { ...c.table, ...patch } });
          const shownCols = [...c.table.columns];
          const hiddenCols = TABLE_COL_IDS.filter((id) => !shownCols.includes(id));
          const moveCol = (i: number, dir: -1 | 1): void => {
            const next = i + dir;
            if (next < 0 || next >= shownCols.length) return;
            [shownCols[i], shownCols[next]] = [shownCols[next], shownCols[i]];
            patchTable({ columns: shownCols });
          };
          const toggleCol = (id: TableColId, on: boolean): void => {
            if (on) patchTable({ columns: [...c.table.columns, id] });
            else if (shownCols.length > 1) patchTable({ columns: shownCols.filter((x) => x !== id) });
          };
          const setColAlign = (id: TableColId, v: TableColAlign): void =>
            patchTable({ aligns: { ...c.table.aligns, [id]: v } });
          const setColWeight = (id: TableColId, v: number): void =>
            patchTable({ colWeights: { ...c.table.colWeights, [id]: v } });
          return (
            <div className="space-y-2">
              <label className="block">
                <span className={label}>榜单变体</span>
                <select
                  value={c.variant}
                  onChange={(e) =>
                    patchBlockConfig(isFloat, b.id, { variant: e.target.value as RankListVariant })
                  }
                  className={input}
                >
                  {(Object.keys(VARIANT_LABEL) as RankListVariant[]).map((v) => (
                    <option key={v} value={v}>
                      {VARIANT_LABEL[v]}
                    </option>
                  ))}
                </select>
              </label>
              {c.variant === 'paged' && (
                <label className="block">
                  <span className={label}>每页条数</span>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={c.pageSize}
                    onChange={(e) => {
                      const v = Math.round(Number(e.target.value));
                      if (Number.isFinite(v) && v >= 1) {
                        patchBlockConfig(isFloat, b.id, { pageSize: Math.min(200, v) });
                      }
                    }}
                    className={input}
                  />
                </label>
              )}
              {/* 行样式（表格变体忽略，隐藏） */}
              {!isTable && (
                <div>
                  <span className={label}>行样式</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className={optBtn(c.rowStyle === 'card')}
                      onClick={() => patchBlockConfig(isFloat, b.id, { rowStyle: 'card' })}
                    >
                      卡片
                    </button>
                    <button
                      type="button"
                      className={optBtn(c.rowStyle === 'minimal')}
                      onClick={() => patchBlockConfig(isFloat, b.id, { rowStyle: 'minimal' })}
                    >
                      极简
                    </button>
                  </div>
                </div>
              )}
              {/* 徽章形状 */}
              <div>
                <span className={label}>徽章形状</span>
                <div className="flex gap-1">
                  {(['circle', 'pill', 'square', 'plain'] as BadgeShape[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={optBtn(c.badgeShape === s)}
                      onClick={() => patchBlockConfig(isFloat, b.id, { badgeShape: s })}
                    >
                      {s === 'circle' ? '圆' : s === 'pill' ? '胶囊' : s === 'square' ? '方' : '数字'}
                    </button>
                  ))}
                </div>
                {c.badgeShape === 'plain' && (
                  <div className="mt-0.5 text-[11px] text-slate-400">纯数字：无底色名次</div>
                )}
              </div>
              {/* 第 1 名图标（auto = 跟随全局奖牌开关） */}
              <label className="block">
                <span className={label}>第 1 名图标</span>
                <select
                  value={c.top1Icon}
                  onChange={(e) =>
                    patchBlockConfig(isFloat, b.id, { top1Icon: e.target.value as Top1Icon })
                  }
                  className={input}
                >
                  {(Object.keys(TOP1_ICON_LABEL) as Top1Icon[]).map((k) => (
                    <option key={k} value={k}>
                      {TOP1_ICON_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              {/* 进度条（表格变体忽略，隐藏） */}
              {!isTable && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex cursor-pointer items-end gap-2 pb-1">
                    <input
                      type="checkbox"
                      checked={c.progressBar.show}
                      onChange={(e) =>
                        patchBlockConfig(isFloat, b.id, {
                          progressBar: { ...c.progressBar, show: e.target.checked },
                        })
                      }
                    />
                    <span>进度条</span>
                  </label>
                  <label className="block">
                    <span className={label}>进度条颜色</span>
                    <select
                      value={c.progressBar.color}
                      onChange={(e) =>
                        patchBlockConfig(isFloat, b.id, {
                          progressBar: {
                            ...c.progressBar,
                            color: e.target.value as 'accent' | 'tier',
                          },
                        })
                      }
                      className={input}
                    >
                      <option value="accent">主题色</option>
                      <option value="tier">按名次</option>
                    </select>
                  </label>
                </div>
              )}
              {/* 表格列（仅 table 变体）：显隐 + 调序 + 对齐 + 权重 */}
              {isTable && (
                <>
                  <div>
                    <span className={label}>表格列（勾选显隐，↑↓ 调序）</span>
                    <div className="space-y-1">
                      {shownCols.map((col, i) => (
                        <div key={col} className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked
                            disabled={shownCols.length <= 1}
                            title={shownCols.length <= 1 ? '至少保留一列' : undefined}
                            onChange={(e) => toggleCol(col, e.target.checked)}
                          />
                          <span className="w-12 shrink-0 text-slate-600">
                            {TABLE_COL_LABEL[col]}
                          </span>
                          <button
                            type="button"
                            title="上移"
                            disabled={i === 0}
                            onClick={() => moveCol(i, -1)}
                            className={smallBtn}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            title="下移"
                            disabled={i === shownCols.length - 1}
                            onClick={() => moveCol(i, 1)}
                            className={smallBtn}
                          >
                            ↓
                          </button>
                          <select
                            value={c.table.aligns[col] ?? TABLE_COL_DEFAULT_ALIGN[col]}
                            onChange={(e) => setColAlign(col, e.target.value as TableColAlign)}
                            className="min-w-0 flex-1 rounded border border-slate-300 px-1 py-0.5 text-[11px]"
                          >
                            {(Object.keys(ALIGN_LABEL) as TableColAlign[]).map((a) => (
                              <option key={a} value={a}>
                                {ALIGN_LABEL[a]}
                              </option>
                            ))}
                          </select>
                          {c.table.colWidthMode === 'custom' && (
                            <input
                              type="number"
                              min={1}
                              max={10}
                              title="列宽权重 1~10"
                              value={c.table.colWeights[col] ?? 1}
                              onChange={(e) => {
                                const v = Math.round(Number(e.target.value));
                                if (Number.isFinite(v)) setColWeight(col, Math.min(10, Math.max(1, v)));
                              }}
                              className="w-12 shrink-0 rounded border border-slate-300 px-1 py-0.5 text-[11px]"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    {hiddenCols.length > 0 && (
                      <div className="mt-1 flex gap-1">
                        {hiddenCols.map((col) => (
                          <button
                            key={col}
                            type="button"
                            onClick={() => toggleCol(col, true)}
                            className={smallBtn}
                          >
                            + {TABLE_COL_LABEL[col]}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      次要字段列按已选次要字段数展开
                    </div>
                  </div>
                  <div>
                    <span className={label}>列宽</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className={optBtn(c.table.colWidthMode === 'auto')}
                        onClick={() => patchTable({ colWidthMode: 'auto' })}
                      >
                        自适应
                      </button>
                      <button
                        type="button"
                        className={optBtn(c.table.colWidthMode === 'custom')}
                        onClick={() => patchTable({ colWidthMode: 'custom' })}
                      >
                        自定义权重
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="flex cursor-pointer items-end gap-2 pb-1">
                      <input
                        type="checkbox"
                        checked={c.table.header.show}
                        onChange={(e) =>
                          patchTable({ header: { ...c.table.header, show: e.target.checked } })
                        }
                      />
                      <span>表头</span>
                    </label>
                    <label className="flex cursor-pointer items-end gap-2 pb-1">
                      <input
                        type="checkbox"
                        checked={c.table.header.bold}
                        onChange={(e) =>
                          patchTable({ header: { ...c.table.header, bold: e.target.checked } })
                        }
                      />
                      <span>加粗</span>
                    </label>
                    <label className="block">
                      <span className={label}>表头底色</span>
                      <select
                        value={c.table.header.bg}
                        onChange={(e) =>
                          patchTable({
                            header: {
                              ...c.table.header,
                              bg: e.target.value as 'theme' | 'none',
                            },
                          })
                        }
                        className={input}
                      >
                        <option value="theme">主题</option>
                        <option value="none">无</option>
                      </select>
                    </label>
                  </div>
                </>
              )}
            </div>
          );
        }
        case 'divider': {
          const c = b.config as DividerBlockConfig;
          return (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={label}>颜色</span>
                  <select
                    value={c.colorMode}
                    onChange={(e) =>
                      patchBlockConfig(isFloat, b.id, {
                        colorMode: e.target.value as 'theme' | 'custom',
                      })
                    }
                    className={input}
                  >
                    <option value="theme">跟随主题主色</option>
                    <option value="custom">自定义</option>
                  </select>
                </label>
                {c.colorMode === 'custom' && (
                  <label className="block">
                    <span className={label}>自定义色</span>
                    <input
                      type="color"
                      value={c.customColor || '#94a3b8'}
                      onChange={(e) =>
                        patchBlockConfig(isFloat, b.id, { customColor: e.target.value })
                      }
                      className="h-7 w-full cursor-pointer rounded border border-slate-300"
                    />
                  </label>
                )}
              </div>
              <label className="block">
                <span className={label}>粗细 {c.thickness}px</span>
                <input
                  type="range"
                  min={1}
                  max={8}
                  step={1}
                  value={c.thickness}
                  onChange={(e) =>
                    patchBlockConfig(isFloat, b.id, { thickness: Number(e.target.value) })
                  }
                  className="w-full"
                />
              </label>
              <label className="block">
                <span className={label}>上下留白 {c.marginY}px</span>
                <input
                  type="range"
                  min={0}
                  max={64}
                  step={1}
                  value={c.marginY}
                  onChange={(e) =>
                    patchBlockConfig(isFloat, b.id, { marginY: Number(e.target.value) })
                  }
                  className="w-full"
                />
              </label>
            </div>
          );
        }
      }
    })();

    // 悬浮块附加坐标编辑（x/y 百分比，仅 floats 生效）
    return (
      <div className="mt-2 space-y-2 rounded border border-slate-200 bg-slate-50 p-2">
        {form}
        {isFloat && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className={label}>X（横向 %）</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={b.x ?? 0}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) {
                      patchBlockMeta(isFloat, b.id, {
                        x: Math.min(100, Math.max(0, Math.round(v))),
                      });
                    }
                  }}
                  className={input}
                />
              </label>
              <label className="block">
                <span className={label}>Y（纵向 %）</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={b.y ?? 0}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) {
                      patchBlockMeta(isFloat, b.id, {
                        y: Math.min(100, Math.max(0, Math.round(v))),
                      });
                    }
                  }}
                  className={input}
                />
              </label>
            </div>
            <div className="text-[11px] text-slate-400">百分比坐标，左上角为原点</div>
          </>
        )}
      </div>
    );
  };

  const renderBlockList = (isFloat: boolean): ReactNode => {
    const list = isFloat ? config.floats : config.blocks;
    return (
      <div className="space-y-1">
        {list.length === 0 && (
          <div className="rounded border border-dashed border-slate-200 px-2 py-3 text-center text-slate-400">
            暂无区块，点击下方添加
          </div>
        )}
        {list.map((b, i) => {
          const selected = selectedId === b.id;
          return (
            <div key={b.id} className="rounded border border-slate-200 bg-white">
              <div className="flex items-center gap-1 px-2 py-1">
                <button
                  type="button"
                  onClick={() => setSelectedId(selected ? null : b.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 text-[11px] font-medium text-slate-500">
                    {BLOCK_META[b.type].icon}
                  </span>
                  <span className="truncate text-xs text-slate-600">
                    {i + 1}. {blockSummary(b)}
                  </span>
                </button>
                <button
                  type="button"
                  title="上移"
                  disabled={i === 0}
                  onClick={() => moveBlock(isFloat, b.id, -1)}
                  className={smallBtn}
                >
                  ↑
                </button>
                <button
                  type="button"
                  title="下移"
                  disabled={i === list.length - 1}
                  onClick={() => moveBlock(isFloat, b.id, 1)}
                  className={smallBtn}
                >
                  ↓
                </button>
                <button
                  type="button"
                  title="删除"
                  onClick={() => removeBlock(isFloat, b.id)}
                  className={`${smallBtn} hover:border-red-300 hover:text-red-600`}
                >
                  ✕
                </button>
              </div>
              {selected && renderConfigForm(b, isFloat)}
            </div>
          );
        })}
      </div>
    );
  };

  const addMenu = (isFloat: boolean): ReactNode => (
    <div className="mt-1 flex gap-1">
      {(Object.keys(BLOCK_META) as BlockType[])
        .filter((t) => t === 'text' || t === 'image')
        .map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => addBlock(t, isFloat)}
            className="flex-1 rounded border border-dashed border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:border-blue-400 hover:text-blue-600"
          >
            + {BLOCK_META[t].label}
          </button>
        ))}
    </div>
  );

  // ---- 榜单字段（次要字段 / 上期值列，自原展示设置面板迁移保留） ----
  const textCols = rawTable.columns.filter((c) => c.type === 'text' || c.type === 'date');
  const secondary1 = config.secondaryKeys[0] ?? '';
  const secondary2 = config.secondaryKeys[1] ?? '';
  const setSecondary = (i: 0 | 1, v: string): void => {
    const arr = [secondary1, secondary2];
    arr[i] = v;
    patchConfig({ secondaryKeys: arr.filter((k) => k !== '') });
  };

  return (
    <div className="space-y-4 text-xs">
      {/* 模板 */}
      <div>
        <span className={label}>预设模板（套用将覆盖当前区块）</span>
        <div className="grid grid-cols-4 gap-1">
          {PRESET_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.description}
              onClick={() => applyTemplate(t.id)}
              className="rounded border border-slate-200 bg-white px-1 py-1.5 text-slate-600 hover:border-blue-400 hover:text-blue-600"
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* 流式区块 */}
      <div>
        <span className={label}>流式区块（从上到下）</span>
        {renderBlockList(false)}
        {showAddMenu ? (
          <div className="mt-1 flex gap-1">
            {(Object.keys(BLOCK_META) as BlockType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => addBlock(t, false)}
                className="flex-1 rounded border border-dashed border-slate-300 bg-white px-1 py-1 text-[11px] text-slate-600 hover:border-blue-400 hover:text-blue-600"
              >
                + {BLOCK_META[t].label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowAddMenu(false)}
              className="rounded border border-slate-200 bg-white px-2 text-slate-400"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddMenu(true)}
            className="mt-1 w-full rounded border border-dashed border-slate-300 bg-white px-2 py-1 text-slate-600 hover:border-blue-400 hover:text-blue-600"
          >
            + 添加区块
          </button>
        )}
      </div>

      {/* 悬浮层 */}
      <div>
        <span className={label}>悬浮元素（绝对定位，Logo/角标等）</span>
        {renderBlockList(true)}
        {addMenu(true)}
      </div>

      {imgError && <div className="text-red-600">{imgError}</div>}

      {/* 榜单字段 */}
      <div className="space-y-2 border-t border-slate-200 pt-2">
        <label className="block">
          <span className={label}>次要字段 1（可选，小字显示）</span>
          <select
            value={secondary1}
            onChange={(e) => setSecondary(0, e.target.value)}
            className={input}
          >
            <option value="">无</option>
            {textCols.map((c) => (
              <option key={c.key} value={c.key}>
                {c.rawName}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>次要字段 2（可选）</span>
          <select
            value={secondary2}
            onChange={(e) => setSecondary(1, e.target.value)}
            className={input}
          >
            <option value="">无</option>
            {textCols.map((c) => (
              <option key={c.key} value={c.key}>
                {c.rawName}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>上期值列（环比，R2-09）</span>
          <select
            value={config.prevValueKey}
            onChange={(e) => patchConfig({ prevValueKey: e.target.value })}
            className={input}
          >
            <option value="">不启用</option>
            {rawTable.columns
              .filter((c) => c.type === 'number' || c.type === 'percent')
              .map((c) => (
                <option key={c.key} value={c.key}>
                  {c.rawName}
                </option>
              ))}
          </select>
        </label>
      </div>
    </div>
  );
}
