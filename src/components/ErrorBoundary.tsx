import { Component, type ReactNode } from 'react';
import { downloadCanvasTemplate } from '../canvas/template';
import { useCanvasStore } from '../store/useCanvasStore';

/**
 * 全局错误边界：任何渲染异常不再白屏，
 * 崩溃页提供「导出模板救数据」（先把工作区存成 JSON 再排障）与「刷新重试」。
 */

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    // 打到控制台便于排查（生产环境不弹给用户看细节）
    console.error('[ErrorBoundary]', error, info.componentStack ?? '');
  }

  private exportBackup = (): void => {
    try {
      downloadCanvasTemplate(useCanvasStore.getState().config);
    } catch (err) {
      console.error('[ErrorBoundary] 导出模板失败', err);
    }
  };

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
        <div className="text-[40px]">⚠️</div>
        <div>
          <h2 className="text-[16px] font-semibold text-slate-800">页面出现异常，已拦截</h2>
          <p className="mt-1 max-w-[520px] text-[12.5px] leading-relaxed text-slate-500">
            你的配置仍保留在本地。建议先「导出模板救数据」把当前工作区存成 JSON 文件，再刷新重试；
            若反复出现，请把模板文件与下方错误信息发给维护同学。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={this.exportBackup}
            className="rounded-md bg-blue-600 px-4 py-2 text-[13px] font-medium text-white shadow-sm hover:bg-blue-700"
          >
            导出模板救数据
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-[13px] text-slate-700 hover:bg-slate-100"
          >
            刷新重试
          </button>
        </div>
        <pre className="max-h-[160px] max-w-[680px] overflow-auto rounded-md border border-slate-200 bg-white p-3 text-left text-[11px] leading-relaxed text-slate-500">
          {String(error.message ?? error)}
        </pre>
      </div>
    );
  }
}
