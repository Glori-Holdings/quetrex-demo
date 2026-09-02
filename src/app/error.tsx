"use client";

import { useEffect } from "react";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="error-page">
      <h1>Something went wrong</h1>
      <p>We could not load your links. Please try again.</p>
      <button type="button" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
