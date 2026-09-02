interface EmptyStateProps {
  archived: boolean;
}

export default function EmptyState({ archived }: EmptyStateProps) {
  return (
    <p className="empty-state">
      {archived
        ? "No archived links yet. Links you archive will show up here."
        : "No links saved yet. Add your first link above to get started."}
    </p>
  );
}
