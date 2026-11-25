import { beforeEach, describe, expect, it } from 'vitest';
import { migrateLegacyKeys, K } from '../keys';
import { appStorage } from '../safeStorage';

/** 更名迁移：老键 → 新键（幂等、不覆盖新值、旧值保留）。node 环境下 appStorage 走内存兜底，直接驱动。 */
describe('存储键迁移', () => {
  beforeEach(() => {
    const keys = [
      ...Object.values(K),
      'rankboard-ui-theme', 'rankboard-projects-v1', 'rankboard-canvas-v3', 'rankboard-canvas-backup-v1', 'onlyrep-migrated-v1',
    ];
    for (const k of keys) appStorage.removeItem(k);
  });

  it('老键有值且新键空 → 拷贝', () => {
    appStorage.setItem('rankboard-ui-theme', 'dark');
    migrateLegacyKeys();
    expect(appStorage.getItem(K.uiTheme)).toBe('dark');
    expect(appStorage.getItem('rankboard-ui-theme')).toBe('dark');
  });

  it('迁移未跑过时老值覆盖新值（老数据理应获胜）；跑过后不再触碰', () => {
    appStorage.setItem('rankboard-ui-theme', 'dark');
    appStorage.setItem(K.uiTheme, 'light');
    migrateLegacyKeys(); // 首迁：覆盖
    expect(appStorage.getItem(K.uiTheme)).toBe('dark');
    appStorage.setItem(K.uiTheme, 'light'); // 用户新改动
    migrateLegacyKeys(); // 已迁移：不动
    expect(appStorage.getItem(K.uiTheme)).toBe('light');
  });

  it('备份前缀键也迁移', () => {
    appStorage.setItem('rankboard-canvas-backup-v1', '{"x":1}');
    migrateLegacyKeys();
    expect(appStorage.getItem('onlyrep-canvas-backup-v1')).toBe('{"x":1}');
  });

  it('幂等：跑两次无副作用', () => {
    appStorage.setItem('rankboard-projects-v1', '{"items":[]}');
    migrateLegacyKeys();
    migrateLegacyKeys();
    expect(appStorage.getItem(K.projects)).toBe('{"items":[]}');
  });
});

// 配置自愈：持久层 manualTable 嵌套 table 形状拍平（AI 旧提示词事故回归）
describe('配置自愈迁移', () => {
  it('canvasPersist 里的嵌套 table 形状被拍平', async () => {
    const { fixPersistedShape } = await import('../keysMigrate');
    const { appStorage: store } = await import('../safeStorage');
    const persisted = {
      state: {
        config: {
          dataSources: [
            { id: 'ds1', name: '表', kind: 'manualTable', table: { columns: ['渠道'], rows: [['公众号']] } },
            { id: 'ds2', name: '正常', kind: 'manualTable', columns: ['x'], rows: [[1]] },
          ],
        },
      },
      version: 0,
    };
    store.setItem(K.canvasPersist, JSON.stringify(persisted));
    fixPersistedShape(K.canvasPersist);
    const fixed = JSON.parse(store.getItem(K.canvasPersist)!) as typeof persisted;
    const [bad, good] = fixed.state.config.dataSources as unknown as { columns: string[]; rows: unknown[][]; table?: unknown }[];
    expect(bad.columns).toEqual(['渠道']);
    expect(bad.rows).toEqual([['公众号']]);
    expect(bad.table).toBeUndefined();
    expect(good.columns).toEqual(['x']); // 正常形状不动
    store.removeItem(K.canvasPersist);
  });
});
