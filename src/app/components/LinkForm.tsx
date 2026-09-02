import { addLink } from "../actions";

interface LinkFormProps {
  error?: string;
  title?: string;
}

export default function LinkForm({ error, title }: LinkFormProps) {
  return (
    <section className="link-form" aria-label="Add a link">
      <h2>Add a link</h2>
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      <form action={addLink} className="form">
        <div>
          <label htmlFor="url">URL</label>
          <input
            id="url"
            name="url"
            type="url"
            required
            placeholder="https://example.com"
          />
        </div>
        <div>
          <label htmlFor="title">Title</label>
          <input
            id="title"
            name="title"
            type="text"
            required
            maxLength={120}
            defaultValue={title}
          />
        </div>
        <div>
          <label htmlFor="note">Note</label>
          <textarea id="note" name="note" maxLength={1000} rows={2} />
        </div>
        <div>
          <label htmlFor="tags">Tags (comma-separated)</label>
          <input
            id="tags"
            name="tags"
            type="text"
            placeholder="reading, reference"
          />
        </div>
        <button type="submit">Save link</button>
      </form>
    </section>
  );
}
