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
