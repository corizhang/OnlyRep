/**
 * 仅测试用的最小 Node 类型声明（项目未装 @types/node，保持零新增依赖）。
 * 仅覆盖 preset.real.test.ts 用到的两个 API。
 */

declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string): Uint8Array;
  export function readdirSync(path: string): string[];
}

declare const process: { cwd(): string };
