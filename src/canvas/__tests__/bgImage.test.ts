import { describe, expect, it } from 'vitest';
import { sanitizeCanvasConfig } from '../template';
import { createDefaultCanvasConfig } from '../defaults';
import { targetSize } from '../../utils/imageFile';

const base = () => JSON.parse(JSON.stringify(createDefaultCanvasConfig()));

describe('背景图与蒙版', () => {
  it('sanitize 放行 data:image/ 并保留 fit/蒙版', () => {
    const c = base();
    c.headerBgImage = 'data:image/webp;base64,abc';
    c.headerBgFit = 'contain';
    c.headerOverlay = '#000000';
    c.headerOverlayOpacity = 0.6;
    c.pageBgImage = 'data:image/jpeg;base64,xyz';
    c.pageOverlayOpacity = 0.3;
    const out = sanitizeCanvasConfig(c);
    expect(out.headerBgImage).toBe('data:image/webp;base64,abc');
    expect(out.headerBgFit).toBe('contain');
    expect(out.headerOverlayOpacity).toBe(0.6);
    expect(out.pageBgImage).toBe('data:image/jpeg;base64,xyz');
    expect(out.pageOverlayOpacity).toBe(0.3);
  });

  it('sanitize 拒绝外链/非图片与超长，非法 fit 清空', () => {
    const c = base();
    c.headerBgImage = 'https://evil.com/x.png';
    c.pageBgImage = 'data:image/png;base64,' + 'a'.repeat(2_000_001);
    c.headerBgFit = 'stretch';
    const out = sanitizeCanvasConfig(c);
    expect(out.headerBgImage).toBe('');
    expect(out.pageBgImage).toBe('');
    expect(out.headerBgFit).toBeUndefined();
  });

  it('蒙版透明度钳制 0~1', () => {
    const c = base();
    c.headerOverlayOpacity = 5;
    c.pageOverlayOpacity = -1;
    const out = sanitizeCanvasConfig(c);
    expect(out.headerOverlayOpacity).toBe(1);
    expect(out.pageOverlayOpacity).toBe(0);
  });

  it('targetSize：宽图缩到 1800，窄图不动', () => {
    expect(targetSize(3600, 1800)).toEqual({ w: 1800, h: 900 });
    expect(targetSize(800, 600)).toEqual({ w: 800, h: 600 });
  });
});
