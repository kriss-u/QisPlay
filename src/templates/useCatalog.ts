import { useCallback, useEffect, useState } from "react";
import { loadCatalog, type Catalog } from "./catalog";

/**
 * The template catalog, fetched once `enabled`. `load()` refetches it if stale
 * (or always, with `force`). Neither catalog nor error means it's loading.
 */
export function useCatalog(enabled: boolean) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchCatalog = useCallback((force: boolean) => {
    loadCatalog(force).then(
      (c) => {
        setCatalog(c);
        setError(null);
      },
      (err: Error) => setError(err.message),
    );
  }, []);

  const load = useCallback(
    (force = false) => {
      setError(null);
      fetchCatalog(force);
    },
    [fetchCatalog],
  );

  useEffect(() => {
    if (enabled) fetchCatalog(false);
  }, [enabled, fetchCatalog]);

  return { catalog, error, load };
}

export type CatalogState = ReturnType<typeof useCatalog>;
