import { Badge, Box, Button, Flex, HStack, Separator, Spinner, Text, Wrap } from "@chakra-ui/react";
import { LuCheck, LuFilePlus } from "react-icons/lu";
import { ENVIRONMENT_FILES, type EnvironmentFile } from "../python/environment";
import { OPTIONAL_PACKAGES, type OptionalPackage } from "../python/optionalPackages";
import type { Python } from "../python/usePython";

interface Props {
  py: Python;
  /** Optional packages the user added. */
  added: string[];
  onChange(id: string, on: boolean): void;
  /** Writes the environment file into the open project (adds it, or brings it up to date). */
  onAddFile(file: EnvironmentFile): void;
  /** Each file's state in the open project; null without one. */
  files: Record<EnvironmentFile, "missing" | "current" | "stale"> | null;
}

function Row({ pkg, py, added, onChange }: { pkg: OptionalPackage } & Pick<Props, "py" | "added" | "onChange">) {
  const status = py.tools[pkg.id];
  const on = added.includes(pkg.id);
  const installing = on && (status?.state === "installing" || (!status && py.state === "loading"));
  return (
    <Flex align="center" justify="space-between" gap="3" py="1.5">
      <Box minW="0">
        <HStack gap="2">
          <Text fontSize="sm" fontWeight="medium" fontFamily="mono">
            {pkg.id}
          </Text>
          {on && status?.state === "installed" && (
            <Badge colorPalette="green" variant="subtle" fontFamily="mono">
              {status.version}
            </Badge>
          )}
          {installing && <Spinner size="xs" />}
        </HStack>
        <Text fontSize="xs" color="fg.muted">
          {pkg.description}
        </Text>
        {on && status?.state === "failed" && (
          <Text fontSize="xs" color="fg.error">
            Couldn't install: {status.error}
          </Text>
        )}
        {!on && status?.state === "installed" && (
          <Text fontSize="xs" color="fg.muted">
            Removed. It's gone the next time you open QisPlay.
          </Text>
        )}
      </Box>
      {on ? (
        <Button size="xs" variant="outline" flexShrink={0} onClick={() => onChange(pkg.id, false)}>
          Remove
        </Button>
      ) : (
        <Button
          size="xs"
          colorPalette="blue"
          flexShrink={0}
          disabled={py.state === "loading"}
          onClick={() => onChange(pkg.id, true)}
        >
          Add
        </Button>
      )}
    </Flex>
  );
}

/** Included packages, optional ones to add or remove, and the environment files for the project. */
export function PackagesPanel({ py, added, onChange, onAddFile, files }: Props) {
  const optional = new Set(OPTIONAL_PACKAGES.map((p) => p.id));
  const group = (g: OptionalPackage["group"]) => OPTIONAL_PACKAGES.filter((p) => p.group === g);
  return (
    <Box>
      <Text fontSize="sm" mb="2" color="fg.muted">
        In this session:
      </Text>
      <Wrap gap="1.5">
        {Object.entries(py.packages)
          // Optional ones show once added; a removed one is still loaded but on its way out.
          .filter(([name]) => !optional.has(name) || added.includes(name))
          .map(([name, v]) => (
            <Badge key={name} variant="subtle" fontFamily="mono">
              {name.replace(/_/g, "-")} {v}
            </Badge>
          ))}
        {py.missing.map((name) => (
          <Badge key={name} colorPalette="orange" variant="outline" fontFamily="mono">
            {name} — not installed
          </Badge>
        ))}
      </Wrap>

      <Separator my="4" />
      <Text fontSize="sm" fontWeight="medium">
        Add packages
      </Text>
      <Text fontSize="xs" color="fg.muted" mb="1">
        Optional. Ones you add load in the background each time you open QisPlay.
      </Text>
      {group("libraries").map((pkg) => (
        <Row key={pkg.id} pkg={pkg} py={py} added={added} onChange={onChange} />
      ))}
      <Text fontSize="sm" fontWeight="medium" mt="3">
        Development tools
      </Text>
      {group("tools").map((pkg) => (
        <Row key={pkg.id} pkg={pkg} py={py} added={added} onChange={onChange} />
      ))}

      <Separator my="4" />
      <Text fontSize="sm" fontWeight="medium" mb="1">
        Add to project
      </Text>
      <Text fontSize="xs" color="fg.muted" mb="2">
        Saves the packages above, pinned to these versions, as a file in your project, to set up the same environment
        elsewhere.
      </Text>
      <HStack gap="2" wrap="wrap">
        {ENVIRONMENT_FILES.map((file) => {
          const state = files?.[file];
          return (
            <Button
              key={file}
              size="xs"
              variant={state === "stale" ? "solid" : "outline"}
              colorPalette={state === "stale" ? "blue" : "gray"}
              disabled={!files || state === "current"}
              onClick={() => onAddFile(file)}
            >
              {state === "current" ? <LuCheck /> : <LuFilePlus />} {file}
              {state === "stale" && " · update"}
              {state === "current" && " · up to date"}
            </Button>
          );
        })}
      </HStack>
      {files && Object.values(files).includes("stale") && (
        <Text fontSize="xs" color="fg.muted" mt="2">
          The packages changed since the file was saved.
        </Text>
      )}
    </Box>
  );
}
