import { getLinks } from "./actions";
import EmptyState from "./components/EmptyState";
import FilterBar from "./components/FilterBar";
import LinkForm from "./components/LinkForm";
import LinkList from "./components/LinkList";

type SearchParams = Record<string, string | string[] | undefined>;

interface PageProps {
  searchParams: Promise<SearchParams>;
}

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const tag = firstParam(params.tag);
  const q = firstParam(params.q);
  const sort = firstParam(params.sort);
  const archived = firstParam(params.archived) === "1";
  const error = firstParam(params.error);
  const titleValue = firstParam(params.title);

  const links = await getLinks({
    tag: tag || undefined,
    q: q || undefined,
    sort: sort || undefined,
    archived,
  });

  return (
    <main className="page">
      <h1>Link Library</h1>
      <LinkForm error={error || undefined} title={titleValue} />
      <FilterBar tag={tag} q={q} sort={sort} archived={archived} />
      {links.length === 0 ? (
        <EmptyState archived={archived} />
      ) : (
        <LinkList links={links} archived={archived} />
      )}
    </main>
  );
}
