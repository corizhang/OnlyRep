import './storage/keysMigrate';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';
import { appStorage } from './storage/safeStorage';
import { K } from './storage/keys';

// 启动即应用 UI 主题（防首帧闪白/闪黑）；走 appStorage 享降级保护
const savedTheme = appStorage.getItem(K.uiTheme);
document.documentElement.dataset.theme = savedTheme === 'dark' ? 'dark' : 'light';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// 旧版排行榜的表格粘贴监听已移入 App（按 mode 挂载），此处不再挂全局监听。
