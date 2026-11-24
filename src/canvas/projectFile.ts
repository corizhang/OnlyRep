import type { CanvasConfig, DataSource } from './types';
import type { CleanedTable } from '../parser/clean';
import { loadSourceSnapshot, saveSourceSnapshot } from './datasource/sourceCache';

/** 空表占位（.rkb 导入时快照先落字节，载入后由 restoreImportCaches 解析填充） */
const EMPTY_TABLE = { columns: [], rows: [] } as unknown as CleanedTable;

/**
 * .rkb 项目文件（JSON 封装）：
 * 项目 = config（壳）+ 导入源原始文件字节（数据本体）。
 * 自包含——拷给同事导入即用，不依赖本机文件路径。
 */

export interface RkbFile {
  kind: 'onlyrep-project';
  version: 1;
  name: string;
  exportedAt: number;
  config: CanvasConfig;
  /** 导入源原始文件（sourceId → base64） */
  files: { sourceId: string; fileName: string; fileBytes: string }[];
}

/** 导出项目为 .rkb（含壳 + 所有导入源原始字节） */
export async function buildProjectFile(name: string, config: CanvasConfig): Promise<RkbFile> {
  const files: RkbFile['files'] = [];
  for (const d of config.dataSources) {
    if (d.kind !== 'import') continue;
    const snap = await loadSourceSnapshot(d.id);
    if (snap?.fileBytes) {
      files.push({ sourceId: d.id, fileName: snap.fp.name, fileBytes: snap.fileBytes });
    }
  }
  return {
    kind: 'onlyrep-project',
    version: 1,
    name,
    exportedAt: Date.now(),
    config,
    files,
  };
}

/** 解析并校验 .rkb 文件 */
export function parseProjectFile(text: string): RkbFile | null {
  try {
    const data = JSON.parse(text) as RkbFile;
    if (!data || !['onlyrep-project', 'rankboard-project'].includes(data.kind as string) || !data.config) return null;
    return data;
  } catch {
    return null;
  }
}

/** 导入项目：写回各源快照（含原始字节），返回 config 供载入 */
export async function ingestProjectFile(rkb: RkbFile): Promise<CanvasConfig> {
  for (const f of rkb.files) {
    // 只有快照缺失/无字节时才重建表（解析走 import 流程在载入后自动做）
    const prev = await loadSourceSnapshot(f.sourceId);
    await saveSourceSnapshot(f.sourceId, {
      fp: prev?.fp ?? { name: f.fileName, size: 0, lastModified: 0 },
      sheetName: prev?.sheetName ?? '',
      table: prev?.table ?? EMPTY_TABLE,
      sheets: prev?.sheets ?? [],
      savedAt: Date.now(),
      fileBytes: f.fileBytes,
    });
  }
  return rkb.config;
}

/** 数据源定义的简要校验（导入提示用） */
export function projectFileSummary(rkb: RkbFile): { blocks: number; sources: number; files: number } {
  return {
    blocks: rkb.config.blocks.length,
    sources: rkb.config.dataSources.filter((d: DataSource) => d.kind === 'import').length,
    files: rkb.files.length,
  };
}
