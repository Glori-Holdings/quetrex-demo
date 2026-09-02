interface FilterBarProps {
  tag: string;
  q: string;
  sort: string;
  archived: boolean;
}

export default function FilterBar({ tag, q, sort, archived }: FilterBarProps) {
  return (
    <form
      method="get"
      action="/"
      className="filter-bar"
      aria-label="Filter links"
    >
      <div>
        <label htmlFor="q">Search</label>
        <input
          id="q"
          name="q"
          type="text"
          defaultValue={q}
          placeholder="Search title or note"
        />
      </div>
      <div>
        <label htmlFor="tag">Tag</label>
        <input
          id="tag"
          name="tag"
          type="text"
          defaultValue={tag}
          placeholder="Filter by tag"
        />
      </div>
      <div>
        <label htmlFor="sort">Sort</label>
        <select id="sort" name="sort" defaultValue={sort || "newest"}>
          <option value="newest">Newest first</option>
          <option value="title">Title (A-Z)</option>
        </select>
      </div>
      <label className="checkbox-label">
        <input
          type="checkbox"
          name="archived"
          value="1"
          defaultChecked={archived}
        />
        Show archived
      </label>
      <button type="submit">Apply filters</button>
      <a href="/">Clear</a>
    </form>
  );
}
