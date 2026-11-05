/**
 * 数值格式化（ARCH §5.5，PRD R3-03）。纯函数，禁止 import React / store。
 */

export interface FormatOpts {
  thousands: boolean;
  /** 'auto' 或固定 0~2 位小数 */
  decimals: number | 'auto';
  /** 'none' 固定不换算；'wan'/'yi' 强制换算；'auto' 跟随列单位推断与量级 */
  unit: 'none' | 'wan' | 'yi' | 'auto';
  /** 值本身是百分比（已 ÷100 存储）时 ×100 并补 % */
  percent: boolean;
  prefix: string;
}

/**
 * auto 小数位规则（ARCH §5.5 注）：
 * - 换算为「万」后保留 1 位（123.5万）；换算为「亿」后保留 2 位（12.34亿）；
 * - 未换算：整数 0 位；非整数取能还原该值的最少位数（至多 2 位）。
 */
export function autoDecimals(out: number): number {
  const scale = Math.max(1, Math.abs(out));
  const eps = 1e-6 * scale;
  if (Math.abs(Math.round(out) - out) < eps) return 0;
  if (Math.abs(parseFloat(out.toFixed(1)) - out) < eps) return 1;
  return 2;
}

/** 整数部分每 3 位加逗号（保留小数部分与负号） */
export function groupThousands(s: string): string {
  const dot = s.indexOf('.');
  const intPart = dot >= 0 ? s.slice(0, dot) : s;
  const decPart = dot >= 0 ? s.slice(dot) : '';
  const sign = intPart.startsWith('-') ? '-' : '';
  const digits = sign ? intPart.slice(1) : intPart;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${grouped}${decPart}`;
}

/**
 * 数值格式化。
 * 验收：1234567 + {thousands:true, unit:'wan', decimals:'auto'} → '123.5万'；
 *       1234567 + {thousands:true, unit:'none', decimals:'auto'} → '1,234,567'。
 */
export function formatValue(v: number, opts: FormatOpts, colUnit: string = ''): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';

  const abs = Math.abs(v);
  let out = abs;
  let suffix = '';

  // 单位换算：auto 跟随列单位推断；|v|≥1e8 用亿、≥1e4 用万
  const useWan =
    opts.unit === 'wan' ||
    (opts.unit === 'auto' && (colUnit === '万' || (abs >= 1e4 && abs < 1e8)));
  const useYi =
    opts.unit === 'yi' || (opts.unit === 'auto' && (colUnit === '亿' || abs >= 1e8));
  if (useYi) {
    out = v / 1e8;
    suffix = '亿';
  } else if (useWan) {
    out = v / 1e4;
    suffix = '万';
  }

  // 百分比列：值已 ÷100，展示时 ×100 并补 %
  if (opts.percent || colUnit === '%') {
    out = out * 100;
    suffix = `%${suffix}`;
  }

  const dp =
    opts.decimals !== 'auto'
      ? Math.max(0, Math.min(2, Math.round(opts.decimals)))
      : suffix.includes('亿')
        ? 2
        : suffix.includes('万')
          ? 1
          : autoDecimals(out);

  let s = out.toFixed(dp);
  if (opts.thousands) s = groupThousands(s);
  return `${v < 0 ? '-' : ''}${opts.prefix}${s}${suffix}`;
}
