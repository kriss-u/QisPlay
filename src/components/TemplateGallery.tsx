import {
  Badge,
  Box,
  Button,
  CloseButton,
  Dialog,
  Flex,
  Heading,
  HStack,
  Input,
  NativeSelect,
  Portal,
  Spinner,
  Text,
  Wrap,
} from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuRefreshCw } from "react-icons/lu";
import type { Project } from "../workspace/db";
import type { TemplateInfo } from "../templates/catalog";
import type { CatalogState } from "../templates/useCatalog";

const LEVEL_COLOR = { beginner: "green", intermediate: "blue", advanced: "purple" } as const;

export interface GalleryFilter {
  collection?: string | null;
  /** A template to highlight, e.g. from a `?template=` link. */
  template?: string | null;
}

interface Props {
  open: boolean;
  filter: GalleryFilter;
  templates: CatalogState;
  projects: Project[];
  onCreate(template: TemplateInfo): Promise<void>;
  onClose(): void;
}

function TemplateCard(props: {
  template: TemplateInfo;
  highlighted: boolean;
  owned: number;
  creating: boolean;
  disabled: boolean;
  onCreate(): void;
}) {
  const { template: t } = props;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (props.highlighted) ref.current?.scrollIntoView({ block: "center" });
  }, [props.highlighted]);

  return (
    <Flex
      ref={ref}
      gap="3"
      p="3"
      borderWidth="1px"
      rounded="md"
      align={{ base: "stretch", sm: "center" }}
      direction={{ base: "column", sm: "row" }}
      borderColor={props.highlighted ? "blue.solid" : undefined}
      bg={props.highlighted ? "blue.subtle" : undefined}
    >
      <Box flex="1" minW="0">
        <HStack gap="2" wrap="wrap">
          <Text fontWeight="semibold">{t.title}</Text>
          {t.level && (
            <Badge size="sm" variant="subtle" colorPalette={LEVEL_COLOR[t.level]}>
              {t.level}
            </Badge>
          )}
          <Text fontSize="xs" color="fg.muted">
            v{t.version}
          </Text>
        </HStack>
        <Text fontSize="sm" color="fg.muted" mt="1">
          {t.description}
        </Text>
        {(t.tags.length > 0 || props.owned > 0) && (
          <Wrap gap="1" mt="2">
            {t.tags.map((tag) => (
              <Badge key={tag} size="sm" variant="outline">
                {tag}
              </Badge>
            ))}
            {props.owned > 0 && (
              <Badge size="sm" variant="subtle" colorPalette="gray">
                in your projects{props.owned > 1 ? ` ×${props.owned}` : ""}
              </Badge>
            )}
          </Wrap>
        )}
      </Box>
      <Button
        size="sm"
        colorPalette="blue"
        variant={props.highlighted ? "solid" : "outline"}
        flexShrink={0}
        loading={props.creating}
        disabled={props.disabled}
        onClick={props.onCreate}
      >
        Create project
      </Button>
    </Flex>
  );
}

/** Pick a template from the catalog and start a new project from it. */
export function TemplateGallery({ open, filter, templates, projects, onCreate, onClose }: Props) {
  const { catalog, error, load } = templates;
  const [collection, setCollection] = useState("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState<string | null>(null);

  // Each time the gallery opens, start from the filter it was opened with.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCollection(filter.collection ?? "");
      setQuery("");
    }
  }

  const owned = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of projects) if (p.template) counts.set(p.template.id, (counts.get(p.template.id) ?? 0) + 1);
    return counts;
  }, [projects]);

  const sections = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    const matches = (t: TemplateInfo) =>
      !q || [t.title, t.description, ...t.tags].some((s) => s.toLowerCase().includes(q));
    const groups = catalog.collections
      .filter((c) => !collection || c.id === collection)
      .map((c) => ({ ...c, templates: catalog.templates.filter((t) => t.collections.includes(c.id) && matches(t)) }));
    if (!collection) {
      const known = new Set(catalog.collections.map((c) => c.id));
      groups.push({
        id: "",
        title: "Other templates",
        description: undefined,
        templates: catalog.templates.filter((t) => !t.collections.some((c) => known.has(c)) && matches(t)),
      });
    }
    return groups.filter((g) => g.templates.length > 0);
  }, [catalog, collection, query]);

  async function create(t: TemplateInfo) {
    setCreating(t.id);
    try {
      await onCreate(t);
    } finally {
      setCreating(null);
    }
  }

  const unknownCollection = !!catalog && !!collection && !catalog.collections.some((c) => c.id === collection);

  return (
    <Dialog.Root open={open} onOpenChange={(e) => !e.open && onClose()} size="lg" scrollBehavior="inside" placement="center">
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content mx="4" maxH="85dvh">
            <Dialog.Header flexDirection="column" alignItems="stretch" gap="3">
              <Dialog.Title>New project from template</Dialog.Title>
              <Flex gap="2" direction={{ base: "column", sm: "row" }}>
                <NativeSelect.Root size="sm" width={{ sm: "56" }} flexShrink={0} disabled={!catalog}>
                  <NativeSelect.Field
                    aria-label="Collection"
                    value={collection}
                    onChange={(e) => setCollection(e.currentTarget.value)}
                  >
                    <option value="">All templates</option>
                    {catalog?.collections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
                <Input
                  size="sm"
                  placeholder="Search by name or topic"
                  aria-label="Search templates"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={!catalog}
                />
              </Flex>
            </Dialog.Header>
            <Dialog.Body pb="6">
              {!catalog && !error && (
                <HStack justify="center" py="10" color="fg.muted">
                  <Spinner size="sm" /> <Text>Loading templates…</Text>
                </HStack>
              )}
              {!catalog && error && (
                <Flex direction="column" align="center" gap="3" py="10" textAlign="center">
                  <Text color="fg.error">{error}</Text>
                  <Button size="sm" variant="outline" onClick={() => load(true)}>
                    <LuRefreshCw /> Try again
                  </Button>
                </Flex>
              )}
              {unknownCollection && (
                <Text fontSize="sm" color="fg.muted" mb="3">
                  No collection "{collection}" was found. Pick one above.
                </Text>
              )}
              {catalog && !sections.length && !unknownCollection && (
                <Text py="10" textAlign="center" color="fg.muted">
                  No templates match.
                </Text>
              )}
              <Flex direction="column" gap="6">
                {sections.map((s) => (
                  <Box key={s.id || "other"}>
                    <Heading size="sm">{s.title}</Heading>
                    {s.description && (
                      <Text fontSize="sm" color="fg.muted">
                        {s.description}
                      </Text>
                    )}
                    <Flex direction="column" gap="2" mt="3">
                      {s.templates.map((t) => (
                        <TemplateCard
                          key={t.id}
                          template={t}
                          highlighted={t.id === filter.template}
                          owned={owned.get(t.id) ?? 0}
                          creating={creating === t.id}
                          disabled={creating !== null && creating !== t.id}
                          onCreate={() => void create(t)}
                        />
                      ))}
                    </Flex>
                  </Box>
                ))}
              </Flex>
            </Dialog.Body>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
