import type { RankTier, TextRole, ThemeId, ThemeTokens } from '../types';

/** 名次 → 档位映射（唯一入口，组件只认这个函数）：1~3 → top3，4~10 → top10，其余 → rest */
export function tierOf(displayRank: number): RankTier {
  if (displayRank >= 1 && displayRank <= 3) return 'top3';
  if (displayRank >= 4 && displayRank <= 10) return 'top10';
  return 'rest';
}

/** 文本角色 → 主题色（文本块 colorMode==='theme' 时使用；custom 时用户自定义色） */
export function roleColorFor(theme: ThemeTokens, role: TextRole): string {
  switch (role) {
    case 'title':
      return theme.titleColor;
    case 'subtitle':
      return theme.subtitleColor;
    case 'body':
      return theme.textColor;
    case 'note':
    case 'signature':
      return theme.secondaryColor;
  }
}

/** 遮罩默认色随深浅主题（config.overlayColor 为 '' 时使用） */
export function defaultOverlayFor(theme: ThemeTokens): string {
  return theme.dark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.6)';
}

/*
 * 主题设计（2026-11 改版）：全部为「白底正文 + 彩色头部通栏色带」。
 * pageBg = 正文底（白/极浅），headerBg = 画布顶部色带（承载标题），
 * titleColor 为白色（落在色带上），正文/次要文字为深色。
 */

/** 商务蓝：蓝色头部 + 白底正文，正式通报场景 */
const businessBlue: ThemeTokens = {
  id: 'businessBlue',
  name: '商务蓝',
  dark: false,
  pageBg: 'linear-gradient(180deg, #FFFFFF 0%, #F4F7FC 100%)',
  headerBg: 'linear-gradient(135deg, #0B3A8C 0%, #1552B8 55%, #2563EB 100%)',
  titleColor: '#FFFFFF',
  subtitleColor: '#334155',
  textColor: '#1E293B',
  secondaryColor: '#64748B',
  accent: '#2563EB',
  medalColors: { gold: '#F5C542', silver: '#C0C4CC', bronze: '#CD8C5C' },
  tiers: {
    top3: {
      badgeBg: 'linear-gradient(135deg, #F5C542 0%, #E09E2F 100%)',
      badgeText: '#3A2A00',
      cardBg: 'linear-gradient(135deg, rgba(245, 197, 66, 0.14) 0%, rgba(245, 197, 66, 0.03) 100%)',
      cardBorder: 'rgba(202, 158, 48, 0.4)',
      textColor: '#1E293B',
      valueColor: '#B45309',
      valueScale: 1.0,
    },
    top10: {
      badgeBg: 'linear-gradient(135deg, rgba(37, 99, 235, 0.9) 0%, rgba(37, 99, 235, 0.6) 100%)',
      badgeText: '#FFFFFF',
      cardBg: '#FFFFFF',
      cardBorder: 'rgba(37, 99, 235, 0.25)',
      textColor: '#1E293B',
      valueColor: '#1D4ED8',
      valueScale: 0.96,
    },
    rest: {
      badgeBg: 'rgba(100, 116, 139, 0.15)',
      badgeText: '#475569',
      cardBg: '#F8FAFC',
      cardBorder: 'transparent',
      textColor: '#64748B',
      valueColor: '#475569',
      valueScale: 0.9,
    },
  },
  fontSizes: { small: 13, medium: 15, large: 18 },
  spacing: { compact: 6, normal: 10, loose: 16 },
};

/** 喜庆红：红色头部 + 白底正文，活动/开门红场景 */
const festiveRed: ThemeTokens = {
  id: 'festiveRed',
  name: '喜庆红',
  dark: false,
  pageBg: 'linear-gradient(180deg, #FFFFFF 0%, #FDF5F4 100%)',
  headerBg: 'linear-gradient(135deg, #B91C1C 0%, #DC2626 55%, #EF4444 100%)',
  titleColor: '#FFFFFF',
  subtitleColor: '#44403C',
  textColor: '#292524',
  secondaryColor: '#78716C',
  accent: '#DC2626',
  medalColors: { gold: '#F5C542', silver: '#C0C4CC', bronze: '#CD8C5C' },
  tiers: {
    top3: {
      badgeBg: 'linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)',
      badgeText: '#4A2A00',
      cardBg: 'linear-gradient(135deg, rgba(252, 211, 77, 0.16) 0%, rgba(252, 211, 77, 0.03) 100%)',
      cardBorder: 'rgba(202, 158, 48, 0.45)',
      textColor: '#292524',
      valueColor: '#B45309',
      valueScale: 1.0,
    },
    top10: {
      badgeBg: 'linear-gradient(135deg, rgba(220, 38, 38, 0.9) 0%, rgba(220, 38, 38, 0.6) 100%)',
      badgeText: '#FFFFFF',
      cardBg: '#FFFFFF',
      cardBorder: 'rgba(220, 38, 38, 0.25)',
      textColor: '#292524',
      valueColor: '#B91C1C',
      valueScale: 0.96,
    },
    rest: {
      badgeBg: 'rgba(120, 113, 108, 0.15)',
      badgeText: '#57534E',
      cardBg: '#FAF9F7',
      cardBorder: 'transparent',
      textColor: '#78716C',
      valueColor: '#57534E',
      valueScale: 0.9,
    },
  },
  fontSizes: { small: 13, medium: 15, large: 18 },
  spacing: { compact: 6, normal: 10, loose: 16 },
};

/** 深色金：墨色头部 + 白底正文 + 金色强调，高端/年度场景 */
const darkGold: ThemeTokens = {
  id: 'darkGold',
  name: '深色金',
  dark: false,
  pageBg: 'linear-gradient(180deg, #FFFFFF 0%, #FAF8F3 100%)',
  headerBg: 'linear-gradient(135deg, #191919 0%, #2B2416 60%, #4A3B14 100%)',
  titleColor: '#F5E6C8',
  subtitleColor: '#3F3A2E',
  textColor: '#292524',
  secondaryColor: '#78716C',
  accent: '#B8860B',
  medalColors: { gold: '#F5C542', silver: '#C0C4CC', bronze: '#CD8C5C' },
  tiers: {
    top3: {
      badgeBg: 'linear-gradient(135deg, #F5C542 0%, #C89B2C 100%)',
      badgeText: '#2A1E00',
      cardBg: 'linear-gradient(135deg, rgba(212, 175, 55, 0.14) 0%, rgba(212, 175, 55, 0.03) 100%)',
      cardBorder: 'rgba(184, 134, 11, 0.4)',
      textColor: '#292524',
      valueColor: '#8B6914',
      valueScale: 1.0,
    },
    top10: {
      badgeBg: 'linear-gradient(135deg, rgba(184, 134, 11, 0.85) 0%, rgba(184, 134, 11, 0.55) 100%)',
      badgeText: '#FFFFFF',
      cardBg: '#FFFFFF',
      cardBorder: 'rgba(184, 134, 11, 0.3)',
      textColor: '#292524',
      valueColor: '#8B6914',
      valueScale: 0.96,
    },
    rest: {
      badgeBg: 'rgba(120, 113, 108, 0.15)',
      badgeText: '#57534E',
      cardBg: '#FAF9F6',
      cardBorder: 'transparent',
      textColor: '#78716C',
      valueColor: '#57534E',
      valueScale: 0.9,
    },
  },
  fontSizes: { small: 13, medium: 15, large: 18 },
  spacing: { compact: 6, normal: 10, loose: 16 },
};

/** 清爽白：蓝色头部 + 纯白正文，PPT/周报贴图场景 */
const cleanWhite: ThemeTokens = {
  id: 'cleanWhite',
  name: '清爽白',
  dark: false,
  pageBg: '#FFFFFF',
  headerBg: 'linear-gradient(135deg, #1E40AF 0%, #2563EB 60%, #3B82F6 100%)',
  titleColor: '#FFFFFF',
  subtitleColor: '#475569',
  textColor: '#1E293B',
  secondaryColor: '#64748B',
  accent: '#2563EB',
  medalColors: { gold: '#F5C542', silver: '#C0C4CC', bronze: '#CD8C5C' },
  tiers: {
    top3: {
      badgeBg: 'linear-gradient(135deg, #F5C542 0%, #E09E2F 100%)',
      badgeText: '#3A2A00',
      cardBg: 'linear-gradient(135deg, rgba(245, 197, 66, 0.14) 0%, rgba(245, 197, 66, 0.03) 100%)',
      cardBorder: 'rgba(202, 158, 48, 0.4)',
      textColor: '#1E293B',
      valueColor: '#B45309',
      valueScale: 1.0,
    },
    top10: {
      badgeBg: 'linear-gradient(135deg, rgba(37, 99, 235, 0.9) 0%, rgba(37, 99, 235, 0.6) 100%)',
      badgeText: '#FFFFFF',
      cardBg: '#FFFFFF',
      cardBorder: 'rgba(37, 99, 235, 0.25)',
      textColor: '#1E293B',
      valueColor: '#1D4ED8',
      valueScale: 0.96,
    },
    rest: {
      badgeBg: 'rgba(100, 116, 139, 0.15)',
      badgeText: '#475569',
      cardBg: '#F8FAFC',
      cardBorder: 'transparent',
      textColor: '#64748B',
      valueColor: '#475569',
      valueScale: 0.9,
    },
  },
  fontSizes: { small: 13, medium: 15, large: 18 },
  spacing: { compact: 6, normal: 10, loose: 16 },
};

/** 全部内置主题（R5-01：商务蓝/喜庆红/深色金/清爽白；2026-11 改为白底+头部色带） */
export const THEMES: Record<ThemeId, ThemeTokens> = {
  businessBlue,
  festiveRed,
  darkGold,
  cleanWhite,
};

/** 主题切换面板用列表（保持固定展示顺序） */
export const THEME_LIST: ThemeTokens[] = [
  businessBlue,
  festiveRed,
  darkGold,
  cleanWhite,
];
