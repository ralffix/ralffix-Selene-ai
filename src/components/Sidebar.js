import { useState, useRef, useEffect } from 'react';
import { MoonIcon, PlusIcon, SearchIcon, KeyIcon, SettingsIcon, PencilIcon, TrashIcon } from './icons';
import ProjectFiles from './ProjectFiles';

// ── Small local icons ──
function ChatBubbleIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}

function FolderGlyph({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

function DotsIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function ChevronLeftIcon({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronUpDownIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8 9 12 5 16 9" />
      <polyline points="8 15 12 19 16 15" />
    </svg>
  );
}

// ── Shared pieces ──
function NavRow({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${
        active
          ? 'bg-[var(--cl-hover)] text-[var(--cl-text)]'
          : 'text-[var(--cl-text-2)] hover:bg-[var(--cl-hover)] hover:text-[var(--cl-text)]'
      }`}
    >
      <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function SectionLabel({ children, right }) {
  return (
    <div className="px-3 pt-1 pb-1.5 text-xs text-[var(--cl-text-3)] font-medium flex items-center justify-between">
      <span>{children}</span>
      {right}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger, active }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 text-left text-sm px-3 py-1.5 transition-colors ${
        danger
          ? 'text-red-400 hover:bg-red-400/10'
          : `${active ? 'text-[var(--cl-text)]' : 'text-[var(--cl-text-2)]'} hover:bg-[var(--cl-hover)] hover:text-[var(--cl-text)]`
      }`}
    >
      <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">{icon}</span>
      <span className="truncate flex-1">{label}</span>
      {active && <span className="text-[var(--cl-accent)] text-xs">✓</span>}
    </button>
  );
}

function RenameInput({ initial, onDone }) {
  const [value, setValue] = useState(initial);
  const doneRef = useRef(false);
  const finish = (save) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(save ? value.trim() : null);
  };
  return (
    <input
      autoFocus
      value={value}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      }}
      onBlur={() => finish(true)}
      onClick={(e) => e.stopPropagation()}
      className="w-full bg-[var(--cl-surface)] border border-[var(--cl-accent)]/50 rounded-lg px-2.5 py-1.5 text-sm text-[var(--cl-text)] outline-none"
    />
  );
}

function ChatRow({ chat, isActive, dotColor, isRenaming, menuOpen, onSelect, onOpenMenu, onStartRename, onFinishRename }) {
  if (isRenaming) {
    return (
      <div className="px-1 py-0.5">
        <RenameInput initial={chat.title} onDone={onFinishRename} />
      </div>
    );
  }

  return (
    <div
      className={`group relative flex items-center rounded-lg transition-colors ${
        isActive ? 'bg-[var(--cl-hover)]' : 'hover:bg-[var(--cl-hover)]'
      }`}
    >
      <button
        onClick={onSelect}
        onDoubleClick={onStartRename}
        onContextMenu={onOpenMenu}
        className={`flex-1 min-w-0 flex items-center gap-2 text-left text-sm px-3 py-1.5 ${
          isActive ? 'text-[var(--cl-text)]' : 'text-[var(--cl-text-2)] group-hover:text-[var(--cl-text)]'
        }`}
      >
        {dotColor && (
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
        )}
        <span className="truncate">{chat.title}</span>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onOpenMenu(e); }}
        title="More"
        className={`mr-1 p-1 rounded-md text-[var(--cl-text-3)] hover:text-[var(--cl-text)] hover:bg-[var(--cl-border)] transition-opacity ${
          menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <DotsIcon className="w-4 h-4" />
      </button>
    </div>
  );
}

function ProjectRow({ project, count, isRenaming, onOpen, onStartRename, onFinishRename, onDelete }) {
  const [confirming, setConfirming] = useState(false); // first click arms the delete, second click does it
  useEffect(() => {
    if (!confirming) return undefined;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  if (isRenaming) {
    return (
      <div className="px-1 py-0.5">
        <RenameInput initial={project.name} onDone={onFinishRename} />
      </div>
    );
  }

  return (
    <div className="group flex items-center rounded-lg hover:bg-[var(--cl-hover)] transition-colors">
      <button
        onClick={onOpen}
        className="flex-1 min-w-0 flex items-center gap-2.5 text-left text-sm px-3 py-2 text-[var(--cl-text-2)] group-hover:text-[var(--cl-text)]"
      >
        <span className="flex-shrink-0" style={{ color: project.color }}>
          <FolderGlyph className="w-4 h-4" />
        </span>
        <span className="truncate">{project.name}</span>
      </button>
      <div className="w-16 flex items-center justify-end pr-2 flex-shrink-0">
        <span className="text-xs text-[var(--cl-text-3)] group-hover:hidden">{count}</span>
        <div className="hidden group-hover:flex items-center gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); onStartRename(); }}
            title="Rename"
            className="p-1 rounded-md text-[var(--cl-text-3)] hover:text-[var(--cl-text)] hover:bg-[var(--cl-border)] transition-colors"
          >
            <PencilIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); if (confirming) { setConfirming(false); onDelete(); } else { setConfirming(true); } }}
            title={confirming ? 'Click again to delete (its chats are kept)' : 'Delete project (its chats are kept)'}
            className={`p-1 rounded-md transition-colors ${confirming ? 'bg-red-500/15 text-red-400 text-[11px] px-1.5' : 'text-[var(--cl-text-3)] hover:text-red-400 hover:bg-red-400/10'}`}
          >
            {confirming ? 'Sure?' : <TrashIcon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({
  chats,
  projects,
  activeChatId,
  activeProjectId,
  collapsed,
  searchQuery,
  onNewChat,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
  onManageKeys,
  onSettings,
  onSearchChange,
  onSelectProject,
  onAddProject,
  onDeleteProject,
  onRenameProject,
  onSetProjectFolder,
  onMoveChatToProject,
  onAddChatInProject,
}) {
  const [view, setView] = useState('chats'); // 'chats' | 'projects'
  const [showSearch, setShowSearch] = useState(false);
  const [showNewProjectInput, setShowNewProjectInput] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [renamingChatId, setRenamingChatId] = useState(null);
  const [renamingProjectId, setRenamingProjectId] = useState(null);
  const [menu, setMenu] = useState(null); // { chatId, x, y }
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // chat waiting for a second click to be deleted

  const searchInputRef = useRef(null);
  const newProjectInputRef = useRef(null);
  const menuRef = useRef(null);
  const profileRef = useRef(null);

  // Jumping into a project from anywhere (e.g. "new chat in project") shows the Projects view
  useEffect(() => {
    if (activeProjectId) setView('projects');
  }, [activeProjectId]);

  useEffect(() => {
    if (showSearch && searchInputRef.current) searchInputRef.current.focus();
  }, [showSearch]);

  useEffect(() => {
    if (showNewProjectInput && newProjectInputRef.current) newProjectInputRef.current.focus();
  }, [showNewProjectInput]);

  // Close popup menus when clicking elsewhere
  useEffect(() => {
    if (!menu && !profileOpen) return undefined;
    const onDown = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      if (profileRef.current && profileRef.current.contains(e.target)) return;
      setMenu(null);
      setProfileOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menu, profileOpen]);

  // The delete confirmation resets whenever the chat menu closes
  useEffect(() => { if (!menu) setConfirmDelete(null); }, [menu]);

  const activeProject = activeProjectId ? projects.find((p) => p.id === activeProjectId) : null;

  const q = searchQuery.trim().toLowerCase();
  const matches = (c) => !q || c.title.toLowerCase().includes(q);
  const byRecent = (list) => [...list].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const allChats = byRecent(chats.filter(matches));
  const projectChats = activeProject ? byRecent(chats.filter((c) => c.projectId === activeProject.id && matches(c))) : [];

  const goChats = () => { setView('chats'); onSelectProject(null); };
  const goProjects = () => { setView('projects'); onSelectProject(null); };

  const toggleSearch = () => {
    setShowSearch((s) => !s);
    if (showSearch) onSearchChange('');
  };

  const openChatMenu = (e, chatId) => {
    e.preventDefault();
    let x;
    let y;
    if (e.type === 'contextmenu') {
      x = e.clientX;
      y = e.clientY;
    } else {
      const r = e.currentTarget.getBoundingClientRect();
      x = r.left;
      y = r.bottom + 4;
    }
    const menuHeight = 150 + projects.length * 32;
    setMenu({
      chatId,
      x: Math.min(x, window.innerWidth - 224),
      y: Math.min(y, Math.max(8, window.innerHeight - menuHeight - 8)),
    });
  };

  const addProjectFromInput = () => {
    if (newProjectName.trim()) onAddProject(newProjectName.trim());
    setNewProjectName('');
    setShowNewProjectInput(false);
  };

  const finishChatRename = (chat, title) => {
    setRenamingChatId(null);
    if (title && title !== chat.title) onRenameChat(chat.id, title);
  };

  const finishProjectRename = (project, name) => {
    setRenamingProjectId(null);
    if (name && name !== project.name) onRenameProject(project.id, name);
  };

  const menuChat = menu ? chats.find((c) => c.id === menu.chatId) : null;

  const renderChatRow = (chat, withDot) => {
    const chatProject = withDot && chat.projectId ? projects.find((p) => p.id === chat.projectId) : null;
    return (
      <ChatRow
        key={chat.id}
        chat={chat}
        isActive={chat.id === activeChatId}
        dotColor={chatProject?.color}
        isRenaming={renamingChatId === chat.id}
        menuOpen={menu?.chatId === chat.id}
        onSelect={() => onSelectChat(chat.id)}
        onOpenMenu={(e) => openChatMenu(e, chat.id)}
        onStartRename={() => setRenamingChatId(chat.id)}
        onFinishRename={(title) => finishChatRename(chat, title)}
      />
    );
  };

  return (
    <aside
      className={`bg-[var(--cl-sidebar)] border-r border-[var(--cl-border)] flex flex-col self-stretch min-h-0 flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
        collapsed ? 'w-0 border-r-0 opacity-0' : 'w-[260px] opacity-100'
      }`}
    >
      <div className="flex flex-col h-full min-w-[260px]">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
          <div className="w-8 h-8 rounded-xl bg-[var(--cl-accent-subtle)] flex items-center justify-center">
            <MoonIcon className="w-5 h-5 text-[var(--cl-accent)]" />
          </div>
          <span className="text-[var(--cl-text)] font-semibold text-[15px] tracking-tight">Selene</span>
        </div>

        {/* Main navigation */}
        <div className="px-2 pt-2 space-y-0.5">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg text-[var(--cl-text)] hover:bg-[var(--cl-hover)] transition-colors"
          >
            <span className="w-5 h-5 rounded-full bg-[var(--cl-accent)] flex items-center justify-center flex-shrink-0">
              <PlusIcon className="w-3 h-3 text-white" />
            </span>
            <span>New chat</span>
          </button>
          <NavRow icon={<SearchIcon />} label="Search" active={showSearch} onClick={toggleSearch} />
          <NavRow icon={<ChatBubbleIcon />} label="Chats" active={view === 'chats'} onClick={goChats} />
          <NavRow icon={<FolderGlyph />} label="Projects" active={view === 'projects'} onClick={goProjects} />
        </div>

        {/* Scrollable list area */}
        <div className="flex-1 min-h-0 overflow-y-auto px-2 pt-3 pb-2">
          {showSearch && (
            <div className="pb-3 px-1 animate-fade-in">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Filter chats..."
                className="w-full bg-[var(--cl-surface)] border border-[var(--cl-border-2)] rounded-lg px-3 py-2 text-sm text-[var(--cl-text)] focus:outline-none focus:border-[var(--cl-accent)]/50 placeholder-[var(--cl-text-3)] transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setShowSearch(false); onSearchChange(''); }
                }}
              />
            </div>
          )}

          {/* ── Chats view: all conversations, newest first ── */}
          {view === 'chats' && (
            <>
              <SectionLabel>{q ? `Results (${allChats.length})` : 'Recents'}</SectionLabel>
              <div className="space-y-0.5">
                {allChats.length === 0 ? (
                  <p className="px-3 py-6 text-xs text-[var(--cl-text-3)] text-center">
                    {q ? 'No chats match your search' : 'No chats yet'}
                  </p>
                ) : (
                  allChats.map((chat) => renderChatRow(chat, true))
                )}
              </div>
            </>
          )}

          {/* ── Projects view: the list of projects ── */}
          {view === 'projects' && !activeProject && (
            <>
              <SectionLabel
                right={(
                  <button
                    onClick={() => setShowNewProjectInput(true)}
                    title="New project"
                    className="p-1 rounded text-[var(--cl-text-3)] hover:text-[var(--cl-text)] hover:bg-[var(--cl-hover)] transition-colors"
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              >
                Projects
              </SectionLabel>

              {showNewProjectInput && (
                <div className="px-1 pb-1">
                  <input
                    ref={newProjectInputRef}
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addProjectFromInput();
                      if (e.key === 'Escape') { setShowNewProjectInput(false); setNewProjectName(''); }
                    }}
                    onBlur={addProjectFromInput}
                    placeholder="Project name"
                    className="w-full bg-[var(--cl-surface)] border border-[var(--cl-accent)]/50 rounded-lg px-3 py-1.5 text-sm text-[var(--cl-text)] outline-none placeholder-[var(--cl-text-3)]"
                  />
                </div>
              )}

              <div className="space-y-0.5">
                {projects.length === 0 && !showNewProjectInput ? (
                  <div className="px-3 py-6 text-center space-y-3">
                    <p className="text-xs text-[var(--cl-text-3)] leading-relaxed">
                      Projects group related chats and can be linked to a folder on your computer.
                    </p>
                    <button
                      onClick={() => setShowNewProjectInput(true)}
                      className="text-xs font-medium text-[var(--cl-accent)] hover:text-[var(--cl-accent-h)] transition-colors"
                    >
                      Create your first project
                    </button>
                  </div>
                ) : (
                  projects.map((project) => (
                    <ProjectRow
                      key={project.id}
                      project={project}
                      count={chats.filter((c) => c.projectId === project.id).length}
                      isRenaming={renamingProjectId === project.id}
                      onOpen={() => onSelectProject(project.id)}
                      onStartRename={() => setRenamingProjectId(project.id)}
                      onFinishRename={(name) => finishProjectRename(project, name)}
                      onDelete={() => onDeleteProject(project.id)}
                    />
                  ))
                )}
              </div>
            </>
          )}

          {/* ── Inside one project ── */}
          {view === 'projects' && activeProject && (
            <>
              <button
                onClick={() => onSelectProject(null)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs text-[var(--cl-text-3)] hover:text-[var(--cl-text)] transition-colors"
              >
                <ChevronLeftIcon />
                <span>All projects</span>
              </button>

              <div className="flex items-center gap-2.5 px-3 pt-2 pb-2">
                <span className="flex-shrink-0" style={{ color: activeProject.color }}>
                  <FolderGlyph className="w-4 h-4" />
                </span>
                <span className="text-sm font-medium text-[var(--cl-text)] truncate">{activeProject.name}</span>
              </div>

              <NavRow
                icon={<PlusIcon className="w-4 h-4 text-[var(--cl-accent)]" />}
                label="New chat in project"
                onClick={() => onAddChatInProject(activeProject.id)}
              />

              <div className="pt-3">
                <SectionLabel>{q ? `Results (${projectChats.length})` : 'Chats'}</SectionLabel>
                <div className="space-y-0.5">
                  {projectChats.length === 0 ? (
                    <p className="px-3 py-6 text-xs text-[var(--cl-text-3)] text-center">
                      {q ? 'No chats match your search' : 'No chats in this project yet'}
                    </p>
                  ) : (
                    projectChats.map((chat) => renderChatRow(chat, false))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Linked folder of the open project */}
        {activeProject && (
          <ProjectFiles
            folderPath={activeProject.linkedFolder}
            onFolderChange={(path) => onSetProjectFolder(activeProject.id, path)}
          />
        )}

        {/* Account area */}
        <div ref={profileRef} className="relative p-2 border-t border-[var(--cl-border)]">
          {profileOpen && (
            <div className="absolute bottom-full left-2 right-2 mb-2 bg-[var(--cl-surface-alt)] border border-[var(--cl-border-2)] rounded-xl shadow-2xl py-1 animate-fade-in">
              <MenuItem
                icon={<KeyIcon className="w-4 h-4" />}
                label="Manage Keys"
                onClick={() => { setProfileOpen(false); onManageKeys(); }}
              />
              <MenuItem
                icon={<SettingsIcon className="w-4 h-4" />}
                label="Settings"
                onClick={() => { setProfileOpen(false); onSettings(); }}
              />
            </div>
          )}
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[var(--cl-hover)] transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--cl-accent)] to-[var(--cl-accent-h)] flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
              S
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-[var(--cl-text)] truncate">User</p>
            </div>
            <ChevronUpDownIcon className="w-4 h-4 text-[var(--cl-text-3)] flex-shrink-0" />
          </button>
        </div>
      </div>

      {/* Chat options menu (⋯ button or right-click) */}
      {menu && menuChat && (
        <div
          ref={menuRef}
          className="fixed z-50 w-52 bg-[var(--cl-surface-alt)] border border-[var(--cl-border-2)] rounded-xl shadow-2xl py-1 animate-fade-in"
          style={{ left: menu.x, top: menu.y }}
        >
          <MenuItem
            icon={<PencilIcon className="w-3.5 h-3.5" />}
            label="Rename"
            onClick={() => { setRenamingChatId(menu.chatId); setMenu(null); }}
          />

          <div className="my-1 border-t border-[var(--cl-border)]" />
          <p className="px-3 pt-1 pb-1 text-[11px] text-[var(--cl-text-3)] font-medium">Add to project</p>
          <MenuItem
            icon={<FolderGlyph className="w-3.5 h-3.5" />}
            label="No project"
            active={!menuChat.projectId}
            onClick={() => { onMoveChatToProject(menu.chatId, null); setMenu(null); }}
          />
          {projects.map((project) => (
            <MenuItem
              key={project.id}
              icon={<span style={{ color: project.color }}><FolderGlyph className="w-3.5 h-3.5" /></span>}
              label={project.name}
              active={menuChat.projectId === project.id}
              onClick={() => { onMoveChatToProject(menu.chatId, project.id); setMenu(null); }}
            />
          ))}
          {projects.length === 0 && (
            <p className="px-3 py-1.5 text-xs text-[var(--cl-text-3)] italic">No projects yet</p>
          )}

          <div className="my-1 border-t border-[var(--cl-border)]" />
          <MenuItem
            danger
            icon={<TrashIcon className="w-3.5 h-3.5" />}
            label={confirmDelete === menu.chatId ? 'Click again to delete' : 'Delete'}
            onClick={() => {
              if (confirmDelete === menu.chatId) { onDeleteChat(menu.chatId); setMenu(null); setConfirmDelete(null); }
              else setConfirmDelete(menu.chatId);
            }}
          />
        </div>
      )}
    </aside>
  );
}
