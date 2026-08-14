// The left-hand agent list (design §1 tree: AgentSidebar.tsx). Just a thin
// list wrapper — all liveness logic lives in AgentSidebarItem / LiveActivity.
import AgentSidebarItem, { type SidebarItem } from './AgentSidebarItem';

export type AgentSidebarProps = {
  items: SidebarItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export default function AgentSidebar({ items, selectedId, onSelect }: AgentSidebarProps) {
  return (
    <nav aria-label="Tu equipo" className="flex w-72 shrink-0 flex-col gap-1 overflow-y-auto bg-sidebar-surface p-3">
      <h2 className="mb-1 px-1.5 text-xs font-semibold uppercase tracking-wide text-sidebar-heading">
        Tu equipo IA
      </h2>
      {items.map((item) => (
        <AgentSidebarItem
          key={item.id}
          item={item}
          selected={item.id === selectedId}
          onSelect={() => onSelect(item.id)}
        />
      ))}
    </nav>
  );
}
