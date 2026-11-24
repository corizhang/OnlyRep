/**
 * 启动迁移入口：必须在任何 store（zustand persist 同步读键）之前执行。
 * main.tsx 第一行 `import './storage/keysMigrate'` 保证顺序（ES 模块副作用导入按序执行）。
 */
import { migrateLegacyKeys } from './keys';

migrateLegacyKeys();
