import { beforeEach, describe, expect, it } from 'vitest';
import { useCanvasStore } from '../../store/useCanvasStore';
import { createDefaultCanvasConfig } from '../defaults';

/** 项目保存隔离：新建工作区后保存绝不能覆盖旧项目（用户事故回归） */
describe('项目保存隔离', () => {
  beforeEach(() => {
    const s = useCanvasStore.getState();
    // 清空项目库与活动项目
    useCanvasStore.setState({ projects: [], activeProjectId: null, config: createDefaultCanvasConfig(), projectDirty: false });
    void s;
  });

  it('保存项目A → 新建空白 → 再保存 → A 不被覆盖，新项目独立存在', () => {
    const st = useCanvasStore.getState;
    // 保存项目 A
    useCanvasStore.setState((s) => ({ config: { ...s.config, title: '项目A的内容' } }));
    const idA = st().saveProject('项目A');
    const blocksA = st().config.blocks.length;
    expect(st().activeProjectId).toBe(idA);

    // 新建空白工作区（用户视角的"新建项目"）
    st().resetCanvas();
    expect(st().activeProjectId).toBeNull(); // 关键断言：活动项目必须断开

    // 编辑并保存 → 应建新项目
    useCanvasStore.setState((s) => ({ config: { ...s.config, title: '项目B的内容' } }));
    const idB = st().saveProject('项目B');
    expect(idB).not.toBe(idA);

    const projects = st().projects;
    expect(projects).toHaveLength(2);
    const a = projects.find((p) => p.id === idA)!;
    const b = projects.find((p) => p.id === idB)!;
    expect(a.config.title).toBe('项目A的内容'); // A 完好
    expect(a.config.blocks).toHaveLength(blocksA);
    expect(b.config.title).toBe('项目B的内容');
  });

  it('从模板新建（loadTemplate）后保存 → 不覆盖旧项目', () => {
    const st = useCanvasStore.getState;
    useCanvasStore.setState((s) => ({ config: { ...s.config, title: '旧项目' } }));
    const idA = st().saveProject('旧项目');

    // 从模板新建
    const tpl = { ...createDefaultCanvasConfig(), title: '模板画布' };
    st().loadTemplate(tpl);
    expect(st().activeProjectId).toBeNull();

    useCanvasStore.setState((s) => ({ config: { ...s.config, title: '模板改的新项目' } }));
    const idB = st().saveProject('新项目');
    expect(st().projects.find((p) => p.id === idA)!.config.title).toBe('旧项目');
    expect(st().projects.find((p) => p.id === idB)!.config.title).toBe('模板改的新项目');
  });

  it('打开项目后再保存 → 覆盖自己（正确行为）', () => {
    const st = useCanvasStore.getState;
    useCanvasStore.setState((s) => ({ config: { ...s.config, title: '原始' } }));
    const idA = st().saveProject('项目A');
    // 模拟重新打开同一项目
    useCanvasStore.setState({ activeProjectId: idA });
    useCanvasStore.setState((s) => ({ config: { ...s.config, title: '改过的' } }));
    const id2 = st().saveProject();
    expect(id2).toBe(idA);
    expect(st().projects).toHaveLength(1);
    expect(st().projects[0].config.title).toBe('改过的');
  });
});
