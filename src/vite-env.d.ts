/// <reference types="vite/client" />

/** 构建时注入：版本号（package.json）与构建时间（vite.config define） */
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
