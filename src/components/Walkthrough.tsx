// First-visit guided tour of the app's features. Steps point at elements
// marked data-tour="…"; ones not on screen (e.g. the explorer on a phone) are
// left out. Floating UI positions the card; the spotlight is a box-shadow
// "hole" over the target. Finishing or skipping is remembered in localStorage.
import { arrow, autoUpdate, flip, offset, shift, useFloating, type Placement } from "@floating-ui/react-dom";
import { Box, Button, CloseButton, Flex, Portal, Text } from "@chakra-ui/react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { formatKeys, PALETTE_KEYS } from "../app/shortcuts";

const DONE_KEY = "qisplay:walkthrough-done";
const PAD = 6; // spotlight padding around the target
const ARROW = 10;

export interface WalkthroughHandle {
  start(): void;
}

/** Steps without a placement have no target and show as a centered dialog. */
type Step = { id: string; title: string; description: string; placement?: Placement };

const STEPS: Step[] = [
  {
    id: "welcome",
    title: "Welcome to QisPlay",
    description:
      "Write and run Python, Qiskit and Qiskit Aer right in your browser. Nothing to install, and your projects stay on this device. Here's a quick look around.",
  },
  {
    id: "project",
    title: "Projects",
    description: "Switch between projects, create or rename them, and download or open a project as a .zip file.",
    placement: "bottom-start",
  },
  {
    id: "explorer",
    title: "Files",
    description: "Your project's files. Add files and folders here; each row's ⋯ menu can rename or delete. Everything saves automatically.",
    placement: "right-start",
  },
  {
    id: "editor",
    title: "Editor",
    description: `A VS Code-style editor with autocomplete. Picking a suggestion that isn't imported yet adds the import for you. ${formatKeys("Shift+Enter")} runs the selected lines in the console.`,
    placement: "right-start",
  },
  {
    id: "run",
    title: "Run and stop",
    description: `Runs the open .py file (${formatKeys("Mod+Enter")} or F5). Stop (${formatKeys("Shift+F5")}) interrupts a long run.`,
    placement: "bottom-start",
  },
  {
    id: "panel",
    title: "Output, console and figures",
    description: "Program output appears here. The console runs Python line by line, and plots from plt.show() or qc.draw(\"mpl\") show up under Figures.",
    placement: "left-start",
  },
  {
    id: "status",
    title: "Python status",
    description: "Python loads in the background the first time. This badge shows when it's ready or running.",
    placement: "bottom-end",
  },
  {
    id: "packages",
    title: "Packages",
    description: "See which packages are available, including numpy, matplotlib, qiskit and qiskit-aer.",
    placement: "bottom-end",
  },
  { id: "theme", title: "Theme", description: "Light, dark, or match your system.", placement: "bottom-end" },
  {
    id: "settings",
    title: "Settings",
    description: `Zoom (${formatKeys("Mod+=")} / ${formatKeys("Mod+-")}) and code font size.`,
    placement: "bottom-end",
  },
  {
    id: "help",
    title: "Keyboard shortcuts",
    description: `Every shortcut in one list. ${formatKeys(PALETTE_KEYS)} opens the command palette with all commands.`,
    placement: "bottom-end",
  },
  {
    id: "more",
    title: "More",
    description: "Packages, theme, settings and keyboard shortcuts are in this menu.",
    placement: "bottom-end",
  },
  {
    id: "done",
    title: "You're all set",
    description: `Press Run to try the starter circuit. You can replay this tour any time from the command palette (${formatKeys(PALETTE_KEYS)}): "Start walkthrough".`,
  },
];

const target = (id: string) => document.querySelector<HTMLElement>(`[data-tour="${id}"]`);

const visible = (el: HTMLElement | null) => {
  const r = el?.getBoundingClientRect();
  return !!r && r.width > 0 && r.height > 0;
};

const isDone = () => {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return true; // storage blocked: don't show it on every visit
  }
};

const markDone = () => {
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch {
    // Not persisted.
  }
};

const ARROW_SIDE = { top: "bottom", bottom: "top", left: "right", right: "left" } as const;

export const Walkthrough = forwardRef<WalkthroughHandle, { ready: boolean }>(function Walkthrough({ ready }, ref) {
  const [steps, setSteps] = useState<Step[] | null>(null); // null = closed
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const [arrowEl, setArrowEl] = useState<HTMLDivElement | null>(null);

  const step = steps?.[index];
  const el = step?.placement ? target(step.id) : null;

  const { refs, floatingStyles, placement, middlewareData } = useFloating({
    placement: step?.placement,
    elements: { reference: el },
    middleware: [offset(PAD + ARROW), flip(), shift({ padding: 8, crossAxis: true }), arrow({ element: arrowEl, padding: 8 })],
    // Also keep the spotlight on the target as panels resize or scroll.
    whileElementsMounted: (reference, floating, update) =>
      autoUpdate(reference, floating, () => {
        update();
        setRect((reference as HTMLElement).getBoundingClientRect());
      }),
  });

  const start = useCallback(() => {
    setSteps(STEPS.filter((s) => !s.placement || visible(target(s.id))));
    setIndex(0);
  }, []);

  const finish = useCallback(() => {
    markDone();
    setSteps(null);
  }, []);

  useImperativeHandle(ref, () => ({ start }), [start]);

  // First visit: start once the workspace has rendered and the layout settled.
  useEffect(() => {
    if (!ready || isDone()) return;
    const timer = setTimeout(start, 600);
    return () => clearTimeout(timer);
  }, [ready, start]);

  const last = steps ? index === steps.length - 1 : false;
  const next = useCallback(() => (last ? finish() : setIndex((i) => i + 1)), [last, finish]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Move focus into the card for each step, so screen readers announce it.
  useEffect(() => {
    if (step) card.current?.focus();
  }, [step]);

  // Esc skips, ←/→ step. Captured first, so the editor and app shortcuts
  // don't see keys while the tour is open.
  useEffect(() => {
    if (!steps) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
      else if (card.current?.contains(e.target as Node)) return; // Tab / Enter on the card's buttons
      else card.current?.focus(); // focus wandered off the card: bring it back
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [steps, finish, next, back]);

  if (!steps || !step) return null;

  const spotlight = step.placement && rect;
  const side = placement.split("-")[0] as keyof typeof ARROW_SIDE;
  const arrowData = middlewareData.arrow;
  // No arrow when the card had to move onto the target (small screens, big targets).
  const shifted = middlewareData.shift;
  const showArrow = !(side === "top" || side === "bottom" ? shifted?.y : shifted?.x);

  return (
    <Portal>
      {/* Blocks the page; dims it unless the spotlight's shadow does. */}
      <Box position="fixed" inset="0" zIndex="modal" bg={spotlight ? "transparent" : "blackAlpha.600"} />
      {spotlight && (
        <Box
          position="fixed"
          zIndex="modal"
          pointerEvents="none"
          rounded="md"
          borderWidth="2px"
          borderColor="blue.solid"
          transition="all 0.2s"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 100vmax rgba(0, 0, 0, 0.6)",
          }}
        />
      )}
      <Box
        ref={(node: HTMLDivElement | null) => {
          card.current = node;
          if (step.placement) refs.setFloating(node);
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="walkthrough-title"
        aria-describedby="walkthrough-description"
        tabIndex={-1}
        zIndex="popover"
        bg="bg.panel"
        color="fg"
        borderWidth="1px"
        rounded="lg"
        shadow="lg"
        p="4"
        w="sm"
        maxW="calc(100vw - 16px)"
        outline="none"
        style={
          step.placement
            ? floatingStyles
            : { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
        }
      >
        {step.placement && (
          <Box
            ref={setArrowEl}
            display={showArrow ? undefined : "none"}
            position="absolute"
            w={`${ARROW}px`}
            h={`${ARROW}px`}
            bg="bg.panel"
            borderColor="border"
            borderTopWidth={side === "bottom" || side === "right" ? "1px" : undefined}
            borderLeftWidth={side === "bottom" || side === "left" ? "1px" : undefined}
            borderBottomWidth={side === "top" || side === "left" ? "1px" : undefined}
            borderRightWidth={side === "top" || side === "right" ? "1px" : undefined}
            style={{
              left: arrowData?.x,
              top: arrowData?.y,
              [ARROW_SIDE[side]]: -ARROW / 2 - 0.5,
              transform: "rotate(45deg)",
            }}
          />
        )}
        <CloseButton size="xs" position="absolute" top="2" right="2" aria-label="Close tour" onClick={finish} />
        <Text fontSize="xs" color="fg.muted" mb="1">
          {index + 1} of {steps.length}
        </Text>
        <Text id="walkthrough-title" fontWeight="semibold" pe="6" mb="1">
          {step.title}
        </Text>
        <Text id="walkthrough-description" fontSize="sm" color="fg.muted">
          {step.description}
        </Text>
        <Flex gap="2" mt="4" align="center">
          {!last && (
            <Button size="xs" variant="ghost" me="auto" onClick={finish}>
              Skip tour
            </Button>
          )}
          {index > 0 && !last && (
            <Button size="xs" variant="ghost" onClick={back}>
              Back
            </Button>
          )}
          <Button size="xs" colorPalette="blue" ms={last ? "auto" : undefined} onClick={next}>
            {last ? "Done" : index === 0 ? "Start" : "Next"}
          </Button>
        </Flex>
      </Box>
    </Portal>
  );
});
