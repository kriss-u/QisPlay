import { Button, Menu, Portal, Text } from "@chakra-ui/react";
import { LuCheck, LuChevronDown, LuDownload, LuFolderPlus, LuPencil, LuTrash2, LuUpload } from "react-icons/lu";
import { validateName } from "../workspace/paths";
import type { Workspace } from "../workspace/useWorkspace";
import { exportProject, importProject } from "./projectArchiveActions";
import { createProject, deleteProject, renameProject } from "../workspace/workspace";
import { useDialogs } from "./dialogContext";
import { showError } from "./toast";

export function ProjectMenu({ ws }: { ws: Workspace }) {
  const dialogs = useDialogs();
  const current = ws.project;

  const nameTaken = (name: string, except?: string) =>
    ws.projects.some((p) => p.id !== except && p.name.toLowerCase() === name.toLowerCase());

  async function onSelect(value: string) {
    try {
      if (value.startsWith("open:")) {
        await ws.openProject(value.slice(5));
      } else if (value === "new") {
        const name = await dialogs.prompt({
          title: "New project",
          label: "Project name",
          confirmLabel: "Create",
          validate: (v) => validateName(v) ?? (nameTaken(v) ? "A project with that name exists" : null),
        });
        if (!name) return;
        const p = await createProject(name, { "main.py": 'print("Hello from Python!")\n' });
        await ws.openProject(p.id);
        ws.openFile("main.py");
      } else if (value === "rename" && current) {
        const name = await dialogs.prompt({
          title: "Rename project",
          initial: current.name,
          confirmLabel: "Rename",
          validate: (v) => validateName(v) ?? (nameTaken(v, current.id) ? "A project with that name exists" : null),
        });
        if (name) await renameProject(current.id, name);
      } else if (value === "zip" && current) {
        await exportProject(ws);
      } else if (value === "import") {
        await importProject(ws);
      } else if (value === "delete" && current) {
        const ok = await dialogs.confirm({
          title: "Delete project?",
          body: (
            <Text>
              <b>{current.name}</b> and all its files will be deleted from this browser.
              Download it as a .zip first if you want to keep a copy.
            </Text>
          ),
          confirmLabel: "Delete project",
          danger: true,
        });
        if (!ok) return;
        const next = ws.projects.find((p) => p.id !== current.id);
        if (next) {
          await ws.openProject(next.id);
        } else {
          const fresh = await createProject("My project", { "main.py": 'print("Hello from Python!")\n' });
          await ws.openProject(fresh.id);
          ws.openFile("main.py");
        }
        await deleteProject(current.id);
      }
    } catch (err) {
      showError(err);
    }
  }

  return (
    <Menu.Root onSelect={({ value }) => void onSelect(value)} positioning={{ placement: "bottom-start" }}>
      <Menu.Trigger asChild>
        <Button size="sm" variant="outline" maxW="260px" aria-label="Switch project">
          <Text truncate>{current?.name ?? "Loading…"}</Text>
          <LuChevronDown />
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="16rem" maxH="70vh" overflowY="auto">
            <Menu.ItemGroup>
              <Menu.ItemGroupLabel>Projects</Menu.ItemGroupLabel>
              {ws.projects.map((p) => (
                <Menu.Item key={p.id} value={`open:${p.id}`}>
                  <Text flex="1" truncate>
                    {p.name}
                  </Text>
                  {p.id === current?.id && <LuCheck />}
                </Menu.Item>
              ))}
            </Menu.ItemGroup>
            <Menu.Separator />
            <Menu.Item value="new">
              <LuFolderPlus /> New project…
            </Menu.Item>
            <Menu.Item value="rename" disabled={!current}>
              <LuPencil /> Rename project…
            </Menu.Item>
            <Menu.Item value="import">
              <LuUpload /> Open project from .zip…
            </Menu.Item>
            <Menu.Item value="zip" disabled={!current}>
              <LuDownload /> Download as .zip
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item value="delete" disabled={!current} color="fg.error" _hover={{ bg: "bg.error", color: "fg.error" }}>
              <LuTrash2 /> Delete project…
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
