export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  function pushPath(path: string) {
    window.history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span>/</span>}
          {item.href ? (
            <button className="hover:text-primary hover:underline" onClick={() => pushPath(item.href!)}>{item.label}</button>
          ) : (
            <span className="text-foreground font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
