export interface LinkFields {
  url: string;
  title: string;
  note: string;
  tags: string[];
}

export interface Link extends LinkFields {
  id: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AddLinkInput {
  url: string;
  title: string;
  note?: string;
  tags?: string[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; message: string };
