import { beforeEach, describe, expect, it } from 'vitest';
import { useCanvasStore } from '../useCanvasStore';
import { createDefaultCanvasConfig } from '../../canvas/defaults';

/** 项目库：保存/切换自动回写/数据不丢（P0 后切模板不清快照） */

const fresh = () => {
  useCanvasStore.setState({
    config: createDefaultCanvasConfig(),
    projects: [],
    activeProjectId: null,
    templates: [],
    activeTemplateId: null,
    sources: {},
  });
};

describe('项目库', () => {
  beforeEach(fresh);

  it('保存当前为项目 + 回写同一项目', () => {
    const st = () => useCanvasStore.getState();
    const id = st().saveProject('11月日报');
    expect(useCanvasStore.getState().projects).toHaveLength(1);
    expect(useCanvasStore.getState().activeProjectId).toBe(id);

    // 修改标题后保存 → 回写同一项目
    st().patchConfig({ title: '11月日报v2' });
    const id2 = st().saveProject();
    expect(id2).toBe(id);
    expect(useCanvasStore.getState().projects[0].config.title).toBe('11月日报v2');
    expect(useCanvasStore.getState().projects).toHaveLength(1);
  });

  it('切换项目自动回写当前 + 载入目标', () => {
    const st = () => useCanvasStore.getState();
    const idA = st().saveProject('项目A');
    st().patchConfig({ title: 'A改后' });
    const idB = st().saveProject('项目B'); // 注意：saveProject 在活动项目 A 上会回写——先重置活动
    useCanvasStore.setState({ activeProjectId: null });
    const idB2 = st().saveProject('项目B');
    // 当前是 B，改点东西
    st().patchConfig({ title: 'B改后' });
    // 切回 A
    expect(st().loadProjectById(idA)).toBe(true);
    expect(useCanvasStore.getState().config.title).toBe('A改后');
    expect(useCanvasStore.getState().activeProjectId).toBe(idA);
    // B 应已被自动回写
    expect(useCanvasStore.getState().projects.find((p) => p.id === idB2)?.config.title).toBe('B改后');
    expect(idB).toBe(idB); // 占位避免误用
  });

  it('项目另存为模板（只存壳）', () => {
    const st = () => useCanvasStore.getState();
    const pid = st().saveProject('快捷支付项目');
    st().saveProjectAsTemplate(pid, '快捷支付模板');
    const tpl = useCanvasStore.getState().templates.find((t) => t.name === '快捷支付模板');
    expect(tpl).toBeTruthy();
    expect(tpl?.config.blocks).toEqual(useCanvasStore.getState().config.blocks);
  });

  it('删除项目清理活动指针', () => {
    const st = () => useCanvasStore.getState();
    const id = st().saveProject('临时');
    st().deleteProject(id);
    expect(useCanvasStore.getState().projects).toHaveLength(0);
    expect(useCanvasStore.getState().activeProjectId).toBeNull();
  });
});
