import type { PosterBlock, RankListBlockConfig, RankListVariant, TextRole } from '../types';
import { createRankListBlockConfig, DEFAULT_ROLE_SCALE, newBlockId } from '../utils/blocks';

/**
 * 预设模板（区块结构一键套用）：4 套内置版式。
 * build() 为工厂函数——每次套用重新生成随机 id，避免不同模板实例间 id 冲突。
 * 模板只描述区块结构，不含任何业务数据；悬浮 Logo 用空图片占位（用户上传后生效）。
 */

export type TemplateId = 'classic' | 'battle' | 'table' | 'blank';

/** 一套海报结构：流式区块 + 悬浮层元素 */
export interface PosterStructure {
  blocks: PosterBlock[];
  floats: PosterBlock[];
}

function textBlock(
  content: string,
  role: TextRole,
  overrides: Partial<PosterBlock['config']> = {},
): PosterBlock {
  const scale = DEFAULT_ROLE_SCALE[role];
  return {
    id: newBlockId(),
    type: 'text',
    config: {
      content,
      role,
      fontSizeScale: scale,
      bold: role === 'title',
      align: role === 'signature' ? 'right' : 'left',
      colorMode: 'theme',
      customColor: '',
      ...overrides,
    },
  };
}

function rankListBlock(
  variant: RankListVariant,
  pageSize = 10,
  overrides: Partial<RankListBlockConfig> = {},
): PosterBlock {
  return {
    id: newBlockId(),
    type: 'rankList',
    config: createRankListBlockConfig(variant, pageSize, overrides),
  };
}

function dividerBlock(): PosterBlock {
  return { id: newBlockId(), type: 'divider', config: { colorMode: 'theme', customColor: '', thickness: 2, marginY: 12 } };
}

/** 悬浮图片占位（Logo/角标，空图片）：x/y 为相对海报宽高的百分比（0~100，左上角原点） */
function imageFloat(x: number, y: number, widthPct: number): PosterBlock {
  return {
    id: newBlockId(),
    type: 'image',
    x,
    y,
    config: { src: null, widthPct, align: 'left', borderRadius: 0 },
  };
}

/** 空内容块不产出海报噪音：文本内容为空时跳过 */
function maybeText(content: string, role: TextRole): PosterBlock[] {
  return content === '' ? [] : [textBlock(content, role)];
}

/**
 * 「经典通报」结构工厂（= v1 固定版式）：
 * text(title) + text(subtitle) + text(caliber/note) + rankList + text(signature)。
 * 同时作为 v1→v2 迁移的翻译目标（migrate.ts 复用）。
 */
export function buildClassicStructure(opts: {
  title: string;
  subtitle: string;
  caliber: string;
  signature: string;
  variant: RankListVariant;
  pageSize: number;
}): PosterStructure {
  const blocks: PosterBlock[] = [
    ...maybeText(opts.title, 'title'),
    ...maybeText(opts.subtitle, 'subtitle'),
    ...maybeText(opts.caliber, 'note'),
    rankListBlock(opts.variant, opts.pageSize),
    ...maybeText(opts.signature, 'signature'),
  ];
  return { blocks, floats: [] };
}

/** 内置预设模板（顺序即 UI 展示顺序） */
export const PRESET_TEMPLATES: {
  id: TemplateId;
  name: string;
  description: string;
  build: () => PosterStructure;
}[] = [
  {
    id: 'classic',
    name: '经典通报',
    description: '标题+副标题+口径+长图榜单+落款（原固定版式）',
    build: () =>
      buildClassicStructure({
        title: '排行榜',
        subtitle: '',
        caliber: '',
        signature: '',
        variant: 'long',
        pageSize: 10,
      }),
  },
  {
    id: 'battle',
    name: '活动战报',
    description: '悬浮 Logo+居中标题+双列榜单+分隔线+居中说明',
    build: () => ({
      blocks: [
        textBlock('活动战报', 'title', { align: 'center', bold: true }),
        textBlock('冲刺进行中', 'subtitle', { align: 'center' }),
        rankListBlock('twoColumn'),
        dividerBlock(),
        textBlock('统计周期：活动期间', 'note', { align: 'center' }),
      ],
      floats: [imageFloat(4, 3, 18)],
    }),
  },
  {
    id: 'table',
    name: '简约表格',
    description: '标题+口径+表格榜单+落款',
    build: () => ({
      blocks: [
        textBlock('排行榜', 'title'),
        textBlock('统计口径：本期数据', 'note'),
        // 简约表格：显式声明默认三列（名次/名称/数值），不显示次要字段列
        rankListBlock('table', 10, {
          table: {
            columns: ['rank', 'name', 'value'],
            colWidthMode: 'auto',
            colWeights: {},
            aligns: {},
            header: { show: true, bold: true, bg: 'theme' },
          },
        }),
        textBlock('', 'signature'),
      ].filter((b) => !(b.type === 'text' && (b.config as { content: string }).content === '')),
      floats: [],
    }),
  },
  {
    id: 'blank',
    name: '空白',
    description: '仅标题+榜单，自由拼装',
    build: () => ({
      blocks: [textBlock('排行榜', 'title'), rankListBlock('long')],
      floats: [],
    }),
  },
];

/** 按 id 查找预设模板 */
export function findPresetTemplate(id: TemplateId): (typeof PRESET_TEMPLATES)[number] | undefined {
  return PRESET_TEMPLATES.find((t) => t.id === id);
}
