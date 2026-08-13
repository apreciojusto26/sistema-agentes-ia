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
    <nav aria-label="Agents" className="flex w-64 flex-col gap-1 border-r border-slate-200 p-2">
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
