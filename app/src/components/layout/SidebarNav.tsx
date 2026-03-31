export interface SidebarNavItem {
  id: string;
  label: string;
  description?: string;
  badge?: string;
}

interface SidebarNavProps {
  items: SidebarNavItem[];
  activeItem: string;
  onSelect: (itemId: string) => void;
}

export const SidebarNav = ({ items, activeItem, onSelect }: SidebarNavProps) => {
  return (
    <nav className="app-nav" aria-label="Hauptnavigation">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={activeItem === item.id ? "app-nav-item active" : "app-nav-item"}
          onClick={() => onSelect(item.id)}
        >
          <span className="app-nav-item__copy">
            <strong>{item.label}</strong>
            {item.description && <span>{item.description}</span>}
          </span>
          {item.badge && <span className="app-nav-item__badge">{item.badge}</span>}
        </button>
      ))}
    </nav>
  );
};
