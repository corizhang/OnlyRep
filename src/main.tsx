import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { useRankStore } from './store/useRankStore';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

/**
 * 全局 paste 监听（R1-02）：只依赖原生 paste 事件（用户手势内天然有权限），
 * 不主动调 async clipboard API（企微内置浏览器/权限受限环境会失败，ARCH 风险 R5）。
 */
document.addEventListener('paste', (e: ClipboardEvent) => {
  const target = e.target as HTMLElement | null;
  if (
    target &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  ) {
    return; // 输入框内的正常粘贴不拦截
  }
  const text = e.clipboardData?.getData('text/plain');
  if (!text) return;
  useRankStore.getState().loadClipboardTsv(text);
});
