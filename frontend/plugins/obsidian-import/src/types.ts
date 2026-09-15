export interface ObsidianDiagnostic {
  severity: 'error' | 'warning';
  code: string;
  path?: string | null;
  message: string;
}

export interface ObsidianPagePreview {
  path: string;
  title: string;
  parentPath?: string | null;
  properties: string[];
  tags: string[];
  blocks: number;
  references: number;
}

export interface ObsidianPreview {
  pages: number;
  folders: number;
  attachments: number;
  brokenReferences: number;
  diagnostics: ObsidianDiagnostic[];
  pagePreview: ObsidianPagePreview[];
}

export interface ObsidianImportResult {
  pagesCreated: number;
  foldersCreated: number;
  attachmentsCreated: number;
  warnings: string[];
  createdNodeIds: string[];
}

export interface ObsidianImportUnavailable {
  code: string;
  message: string;
  preview: ObsidianPreview;
}
