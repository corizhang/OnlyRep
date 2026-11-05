/**
 * File System Access API 类型补充（Chrome/Edge，Firefox/Safari 不支持需运行时检测）。
 * TS 内置 lib.dom 尚未收录 showOpenFilePicker。
 */

interface Window {
  showOpenFilePicker?: (options?: {
    types?: { description?: string; accept: Record<string, string[]> }[];
    excludeAcceptAllOption?: boolean;
    multiple?: boolean;
  }) => Promise<FileSystemFileHandle[]>;
}
