import { describe, expect, it } from 'vitest';
import { buildProjectFile, ingestProjectFile, parseProjectFile, projectFileSummary } from '../projectFile';
import { loadSourceSnapshot, saveSourceSnapshot, base64ToFile, fileToBase64 } from '../datasource/sourceCache';
import { createDefaultCanvasConfig } from '../defaults';
import type { ImportDataSource } from '../types';

describe('项目文件 .rkb', () => {
  it('base64 ↔ File 字节无损', async () => {
    const content = '姓名,数值\n张三,100\n李四,200';
    const f = new File([content], 'test.csv', { type: 'text/csv' });
    const b64 = await fileToBase64(f);
    const back = base64ToFile(b64, 'test.csv', 'text/csv');
    expect(await back.text()).toBe(content);
  });

  it('导出→导入 往返：壳与原始字节完整', async () => {
    const config = createDefaultCanvasConfig();
    const ds: ImportDataSource = { id: 'ds_x', name: '活动表', kind: 'import', fileName: 'a.csv', sheetName: '' };
    config.dataSources.push(ds);
    const csvBytes = await fileToBase64(new File(['c1,c2\n1,2'], 'a.csv'));
    await saveSourceSnapshot('ds_x', {
      fp: { name: 'a.csv', size: 7, lastModified: 1 },
      sheetName: '',
      table: { columns: [], rows: [] } as never,
      sheets: [],
      savedAt: 1,
      fileBytes: csvBytes,
    });

    const rkb = await buildProjectFile('测试项目', config);
    expect(rkb.kind).toBe('onlyrep-project');
    expect(rkb.files).toHaveLength(1);
    expect(rkb.files[0].fileBytes).toBe(csvBytes);

    // 序列化→解析
    const parsed = parseProjectFile(JSON.stringify(rkb));
    expect(parsed).toBeTruthy();
    expect(projectFileSummary(parsed!)).toEqual({ blocks: config.blocks.length, sources: 1, files: 1 });

    // 导入到新环境：快照按源 id 落库（含字节）
    const cfg = await ingestProjectFile(parsed!);
    expect(cfg.blocks).toEqual(config.blocks);
    const snap = await loadSourceSnapshot('ds_x');
    expect(snap?.fileBytes).toBe(csvBytes);
  });

  it('坏文件拒绝', () => {
    expect(parseProjectFile('{"foo":1}')).toBeNull();
    expect(parseProjectFile('not json')).toBeNull();
  });
});
