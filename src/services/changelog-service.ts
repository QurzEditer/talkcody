// Changelog data service for What's New dialog

export type ChangelogItem =
  | string
  | {
      title: string;
      description?: string;
      videoUrl?: string;
    };

export interface ChangelogContent {
  added?: ChangelogItem[];
  changed?: ChangelogItem[];
  fixed?: ChangelogItem[];
  removed?: ChangelogItem[];
  security?: ChangelogItem[];
  deprecated?: ChangelogItem[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  en: ChangelogContent;
  zh: ChangelogContent;
}

// Changelog data - update this when releasing new versions
// Only include the most recent versions that users care about
export const CHANGELOG_DATA: ChangelogEntry[] = [
  {
    version: '0.4.3',
    date: '2026-02-20',
    en: {
      added: [
        'New Claude Opus 4.6 Model: Added Claude Opus 4.6 model support.',
        'New GPT-5.3 Codex Spark Model: Added GPT-5.3 Codex Spark model support.',
        'New Gemini 3.1 Pro Model: Added Gemini 3.1 Pro model support.',
        'All new coding models are available via hot update immediately.',
      ],
      fixed: ['Fixed UI layout bug when opening files on the homepage.'],
    },
    zh: {
      added: [
        '新增 Claude Opus 4.6 模型。',
        '新增 GPT-5.3 Codex Spark 模型。',
        '新增 Gemini 3.1 Pro 模型。',
        '以上模型都第一时间热更新，之后的新 Coding 模型也都会第一时间热更新。',
      ],
      fixed: ['修复主页打开文件时 UI 布局的 bug。'],
    },
  },
];

export function getChangelogForVersion(version: string): ChangelogEntry | undefined {
  return CHANGELOG_DATA.find((entry) => entry.version === version);
}

export function getLatestChangelog(): ChangelogEntry | undefined {
  return CHANGELOG_DATA[0];
}
