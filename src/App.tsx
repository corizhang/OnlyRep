import { useEffect, useState } from 'react';
import { ConfigProvider } from 'antd';
import PanelLayout from './components/PanelLayout';
import CanvasApp from './canvas/components/CanvasApp';

/**
 * 顶层入口：默认进入「日报画布」（排行榜是画布上的一种复合块）；
 * 旧版排行榜编辑器保留为兼容入口，两套状态互不影响（独立 persist key）。
 */
type Mode = 'canvas' | 'rank';

const KEY = 'rankboard:entry-mode';

/** antd 主题：对齐编辑器现有蓝灰基线与紧凑密度 */
const antdTheme = {
  token: {
    colorPrimary: '#2563eb',
    borderRadius: 6,
    fontSize: 13,
    controlHeight: 32,
    controlHeightSM: 26,
  },
};

export default function App() {
  const [mode, setMode] = useState<Mode>(() => {
    const saved = localStorage.getItem(KEY);
    return saved === 'rank' ? 'rank' : 'canvas';
  });

  useEffect(() => {
    localStorage.setItem(KEY, mode);
  }, [mode]);

  return (
    <ConfigProvider theme={{ token: antdTheme.token }}>
      {mode === 'canvas' ? (
        <CanvasApp onOpenLegacy={() => setMode('rank')} />
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => setMode('canvas')}
            className="fixed bottom-4 right-4 z-50 rounded-full bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-lg hover:bg-blue-700"
          >
            ← 返回日报画布
          </button>
          <PanelLayout />
        </div>
      )}
    </ConfigProvider>
  );
}
