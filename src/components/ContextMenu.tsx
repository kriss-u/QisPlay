// Right-click menus (VS Code's context menus) for the explorer, editor and tabs.
// They open at the mouse pointer. On touch screens the browser keeps its own
// long-press menu, which text selection relies on.
import { Box, Menu, Portal } from "@chakra-ui/react";
import { Fragment, useState, type MouseEvent, type ReactNode } from "react";
import { formatKeys, type Keys } from "../app/shortcuts";

/** null draws a separator. */
export type MenuEntry = { value: string; label: string; keys?: Keys; disabled?: boolean; danger?: boolean } | null;

/** Items for a Menu.Content, shared by context menus and the explorer's ⋯ menus. */
export function MenuItems({ items }: { items: MenuEntry[] }) {
  return items.map((item, i) =>
    item === null ? (
      // Skip separators at the edges or next to each other (e.g. after hidden items).
      i > 0 && i < items.length - 1 && items[i - 1] !== null ? <Menu.Separator key={`sep-${i}`} /> : <Fragment key={`sep-${i}`} />
    ) : (
      <Menu.Item
        key={item.value}
        value={item.value}
        disabled={item.disabled}
        {...(item.danger ? { color: "fg.error", _hover: { bg: "bg.error", color: "fg.error" } } : {})}
      >
        {item.label}
        {item.keys && <Menu.ItemCommand>{formatKeys(item.keys)}</Menu.ItemCommand>}
      </Menu.Item>
    ),
  );
}

const isTouch = (e: MouseEvent) =>
  (e.nativeEvent as PointerEvent).pointerType === "touch" || window.matchMedia("(hover: none)").matches;

/**
 * Wraps `children` (without adding a box) and opens a menu where it's
 * right-clicked. `items` runs at that moment, so it can look at what was clicked;
 * returning null keeps the browser's own menu.
 */
export function ContextMenu(props: {
  items(e: MouseEvent): MenuEntry[] | null;
  onSelect(value: string): void;
  children: ReactNode;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuEntry[] } | null>(null);

  return (
    <>
      <Box
        display="contents"
        onContextMenu={(e) => {
          if (isTouch(e)) return;
          const items = props.items(e);
          if (!items?.length) return;
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, items });
        }}
      >
        {props.children}
      </Box>
      <Menu.Root
        open={!!menu}
        onOpenChange={(e) => !e.open && setMenu(null)}
        // With no trigger element, the menu positions from this rect (anchorPoint
        // alone is ignored when it opens), so it appears at the pointer.
        positioning={{
          placement: "bottom-start",
          gutter: 2,
          getAnchorRect: () => (menu ? { x: menu.x, y: menu.y, width: 0, height: 0 } : null),
        }}
        onSelect={({ value }) => props.onSelect(value)}
      >
        <Portal>
          <Menu.Positioner>
            <Menu.Content minW="12rem">{menu && <MenuItems items={menu.items} />}</Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </>
  );
}
