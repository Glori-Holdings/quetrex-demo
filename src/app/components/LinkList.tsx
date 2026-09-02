import type { Link } from "@/lib/types";
import { archiveLink, restoreLink } from "../actions";

interface LinkListProps {
  links: Link[];
  archived: boolean;
}

export default function LinkList({ links, archived }: LinkListProps) {
  return (
    <ul className="link-list">
      {links.map((link) => (
        <li key={link.id} className="link-item">
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            {link.title}
          </a>
          <span className="link-url">{link.url}</span>
          {link.note ? <p className="link-note">{link.note}</p> : null}
          {link.tags.length > 0 ? (
            <ul className="link-tags">
              {link.tags.map((tag) => (
                <li key={tag}>
                  <a href={`/?tag=${encodeURIComponent(tag)}`}>{tag}</a>
                </li>
              ))}
            </ul>
          ) : null}
          <form
            action={archived ? restoreLink : archiveLink}
            className="link-actions"
          >
            <input type="hidden" name="id" value={link.id} />
            <button type="submit">{archived ? "Restore" : "Archive"}</button>
          </form>
        </li>
      ))}
    </ul>
  );
}
