import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import {
  ChevronsLeftIcon,
  FolderPlusIcon,
  HomeIcon,
  LayoutTemplateIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  ShareIcon,
  SquarePenIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';
import { Button, IconButton, Kbd, Switch, Tooltip } from '@nook/ui';
import { usePluginSidebarPanels } from '@nook/plugin-sdk';
import { useUiStore } from '../../stores/ui';
import { queryKeys, useCreateNode, useDeleteNode, useMe } from '../../lib/queries';
import { modKey } from '../../lib/utils';
import { toast } from '../../stores/toast';
import { uploadFileWithProgress } from '../../features/files/upload';
import { HiddenFileInput } from '../shared/HiddenFileInput';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { Tree } from '../tree/Tree';
import { FavoritesList } from './FavoritesList';
import { SidebarNavItem } from './SidebarNavItem';
import { SidebarSection } from './SidebarSection';

export function Sidebar({ workspaceId }: { workspaceId: string }) {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const showArchived = useUiStore((s) => s.showArchived);
  const setShowArchived = useUiStore((s) => s.setShowArchived);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useCreateNode(workspaceId);
  const remove = useDeleteNode(workspaceId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const { data: me } = useMe();
  const panels = usePluginSidebarPanels();
  const workspace = me?.workspaces.find((w) => w.id === workspaceId);
  const canEdit = workspace?.role !== 'viewer';

  async function newPage(parentId: string | null = null) {
    const node = await create.mutateAsync({
      parentId: parentId ?? undefined,
      kind: 'page',
      title: '',
    });
    await navigate({ to: '/w/$workspaceId/p/$nodeId', params: { workspaceId, nodeId: node.id } });
  }

  async function newFolder(parentId: string | null = null) {
    const node = await create.mutateAsync({
      parentId: parentId ?? undefined,
      kind: 'folder',
      title: '',
    });
    await navigate({ to: '/w/$workspaceId/p/$nodeId', params: { workspaceId, nodeId: node.id } });
  }

  async function uploadFiles(files: File[]) {
    if (!files.length || uploadingFiles) return;
    setUploadingFiles(true);
    const opened: string[] = [];
    let failures = 0;
    for (const file of files) {
      let nodeId: string | null = null;
      try {
        const node = await create.mutateAsync({ kind: 'file', title: file.name });
        nodeId = node.id;
        await uploadFileWithProgress(file, { workspaceId, nodeId: node.id, purpose: 'content' });
        await queryClient.invalidateQueries({
          queryKey: queryKeys.nodeFiles(workspaceId, node.id),
        });
        opened.push(node.id);
      } catch {
        failures += 1;
        if (nodeId) await remove.mutateAsync(nodeId).catch(() => undefined);
      }
    }
    setUploadingFiles(false);
    if (opened.length === 1 && files.length === 1) {
      await navigate({
        to: '/w/$workspaceId/p/$nodeId',
        params: { workspaceId, nodeId: opened[0]! },
      });
    }
    if (opened.length)
      toast(`${opened.length} ${opened.length === 1 ? 'file' : 'files'} added to the tree`);
    if (failures)
      toast(
        `${failures} ${failures === 1 ? 'file could' : 'files could'} not be uploaded`,
        'error',
      );
  }

  return (
    <div className="flex h-full min-w-[var(--sidebar-min)] flex-col overflow-hidden">
      <div className="border-b border-border/70 px-3 pt-3 pb-2">
        <div className="flex items-center gap-1">
          <WorkspaceSwitcher workspaceId={workspaceId} />
          <Tooltip content={`Close sidebar (${modKey()}\\)`}>
            <IconButton
              label="Close sidebar"
              size="icon-sm"
              tooltip={false}
              onClick={toggleSidebar}
              className="text-fg-muted"
            >
              <ChevronsLeftIcon />
            </IconButton>
          </Tooltip>
        </div>
        <div className="mt-2 flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={() => setPaletteOpen(true)}
            data-testid="nav-search"
            className="group min-w-0 flex-1 justify-start gap-3 rounded-[var(--radius-md)] px-3 text-[13px] font-normal text-sidebar-foreground transition-colors duration-[var(--duration)] hover:bg-bg-hover hover:text-fg"
          >
            <span className="flex size-6 shrink-0 items-center justify-center text-fg-muted group-hover:text-fg-secondary">
              <SearchIcon className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1 truncate">Search</span>
            <Kbd className="h-4 min-w-4 border-0 bg-transparent px-0 text-[11px]">{modKey()}K</Kbd>
          </Button>
          {canEdit ? (
            <Tooltip content={`New page (${modKey()}⇧N)`}>
              <IconButton
                label="New page"
                size="icon-sm"
                tooltip={false}
                onClick={() => newPage()}
                data-testid="new-page"
                className="size-9 rounded-[var(--radius-md)] text-fg-muted hover:bg-bg-hover hover:text-fg"
              >
                <SquarePenIcon className="size-[18px]" />
              </IconButton>
            </Tooltip>
          ) : null}
        </div>
      </div>
      <nav
        className="flex-1 overflow-x-hidden overflow-y-auto px-3 pb-5"
        aria-label="Workspace navigation"
      >
        <div className="flex flex-col gap-0.5 pt-2">
          <SidebarNavItem
            icon={HomeIcon}
            label="Home"
            href={`/w/${workspaceId}`}
            testId="nav-home"
          />
          <SidebarNavItem
            icon={ShareIcon}
            label="Graph"
            href={`/w/${workspaceId}/graph`}
            external
            testId="nav-graph"
          />
          <SidebarNavItem
            icon={SettingsIcon}
            label="Settings"
            href={`/w/${workspaceId}/settings/account`}
            exact={false}
            testId="nav-settings"
          />
        </div>

        <SidebarSection id="favorites" title="Favorites" testId="section-favorites">
          <FavoritesList workspaceId={workspaceId} />
        </SidebarSection>

        <SidebarSection
          id="private"
          title="Private"
          testId="section-private"
          action={
            <>
              <Tooltip content={showArchived ? 'Hide archived pages' : 'Show archived pages'}>
                <span className="flex h-5 items-center gap-1 px-1 text-[11px] text-fg-muted">
                  <Switch
                    aria-label="Show archived"
                    checked={showArchived}
                    onCheckedChange={setShowArchived}
                    className="h-[14px] w-[24px] p-[1px] [&_span]:size-[12px] [&_span]:data-checked:translate-x-[10px]"
                    data-testid="toggle-archived"
                  />
                </span>
              </Tooltip>
              {canEdit ? (
                <>
                  <HiddenFileInput
                    inputRef={fileInput}
                    multiple
                    onFiles={(files) => void uploadFiles(files)}
                    aria-label="Upload files to tree"
                  />
                  <IconButton
                    label={uploadingFiles ? 'Uploading files…' : 'Upload files'}
                    size="icon-sm"
                    className="size-5 text-fg-muted"
                    disabled={uploadingFiles}
                    onClick={() => fileInput.current?.click()}
                    data-testid="upload-tree-files"
                  >
                    <UploadIcon className="size-4" />
                  </IconButton>
                  <IconButton
                    label="Add a folder"
                    size="icon-sm"
                    className="size-5 text-fg-muted"
                    onClick={() => newFolder()}
                    data-testid="new-folder"
                  >
                    <FolderPlusIcon className="size-4" />
                  </IconButton>
                  <IconButton
                    label="Add a page"
                    size="icon-sm"
                    className="size-5 text-fg-muted"
                    onClick={() => newPage()}
                  >
                    <PlusIcon className="size-4" />
                  </IconButton>
                </>
              ) : null}
            </>
          }
        >
          <Tree workspaceId={workspaceId} scope="private" />
        </SidebarSection>

        <SidebarSection id="shared" title="Shared with me" testId="section-shared">
          <Tree workspaceId={workspaceId} scope="shared" emptyText="Nothing shared yet." />
        </SidebarSection>

        {panels.map((panel) => {
          const Panel = panel.component;
          return (
            <SidebarSection
              key={`${panel.pluginId}:${panel.id}`}
              id={`plugin:${panel.pluginId}:${panel.id}`}
              title={panel.title}
            >
              <Panel workspaceId={workspaceId} />
            </SidebarSection>
          );
        })}

        <div className="mt-5 flex flex-col gap-0.5">
          <SidebarNavItem
            icon={LayoutTemplateIcon}
            label="Templates"
            onClick={() => toast('Templates are coming in a later wave')}
          />
          <SidebarNavItem
            icon={Trash2Icon}
            label="Trash"
            href={`/w/${workspaceId}/trash`}
            testId="nav-trash"
          />
        </div>
      </nav>
    </div>
  );
}
