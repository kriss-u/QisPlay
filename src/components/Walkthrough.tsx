// Guided tour of the app's features (steps in walkthroughSteps.ts). A first
// visit gets the whole tour; a returning visitor gets only the steps newer
// than the revision they last finished, as "What's new". Steps point at
// elements marked data-tour="…", or at their fallback when that is hidden
// (e.g. the menu holding it on a phone); ones with neither on screen are left
// out. Floating UI positions the card; the spotlight is a box-shadow "hole"
// over the target.
import { arrow, autoUpdate, flip, offset, shift, useFloating, type Placement } from "@floating-ui/react-dom";
import { Badge, Box, Button, CloseButton, Flex, HStack, Icon, Portal, Stack, Text } from "@chakra-ui/react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { IconType } from "react-icons";
import { LuArrowLeft, LuArrowRight, LuCheck, LuSmartphone, LuSparkles } from "react-icons/lu";
import { Logo } from "./Logo";
import { CAUGHT_UP, DONE, LATEST, STEPS, WELCOME, WHATS_NEW, type Step } from "./walkthroughSteps";

const SEEN_KEY = "qisplay:walkthrough-done";
const PAD = 6; // spotlight padding around the target
const ARROW = 10;
const ARROW_MAX_SPAN = 320;
const BRAND = "linear-gradient(135deg, #4f46e5, #7c3aed)";

export interface WalkthroughHandle {
  start(): void;
}

/**
 * One card of a running tour. `target` is the data-tour id it points at, and
 * `moved` says that is the step's fallback. Cards without a target (all `hero`
 * ones) show centered.
 */
interface Card {
  key: string;
  title: string;
  description: string;
  icon?: IconType;
  target?: string;
  moved?: boolean;
  placement?: Placement;
  fresh?: boolean;
  hero?: boolean;
  items?: { title: string; icon: IconType }[];
}

const target = (id: string) => document.querySelector<HTMLElement>(`[data-tour="${id}"]`);

const visible = (el: HTMLElement | null) => {
  const r = el?.getBoundingClientRect();
  return !!r && r.width > 0 && r.height > 0;
};

/** The step as a card on this screen, or null when nothing it points at is visible. */
function stepCard(s: Step, fresh: boolean): Card | null {
  const card: Card = {
    key: s.id,
    title: s.title,
    description: fresh ? (s.news ?? s.description) : s.description,
    icon: s.icon,
    placement: s.placement,
    fresh,
  };
  if (!s.placement) return card;
  if (visible(target(s.id))) return { ...card, target: s.id };
  // Fallbacks are small header buttons with no room beside them on a phone.
  if (s.fallback && visible(target(s.fallback)))
    return { ...card, target: s.fallback, moved: true, placement: "bottom" };
  return null;
}

const shown = (c: Card | null): c is Card => c !== null;

/**
 * The tour for a first visit, or from "Start walkthrough". A step moved onto
 * an element that has a step of its own (Settings onto the phone's ⋮ menu) is
 * left out: that step already covers it, and repeating the spotlight on one
 * button reads as a stuck tour.
 */
function fullTour(): Card[] {
  const cards = STEPS.map((s) => stepCard(s, false)).filter(shown);
  const own = new Set(cards.filter((c) => c.target && !c.moved).map((c) => c.target));
  return [
    { key: "welcome", hero: true, ...WELCOME },
    ...cards.filter((c) => !c.moved || !own.has(c.target)),
    { key: "done", hero: true, ...DONE },
  ];
}

/** Steps newer than `seen`, or null when none of them can be shown. */
function newsTour(seen: number): Card[] | null {
  const fresh = STEPS.filter((s) => s.since > seen)
    .map((s) => stepCard(s, true))
    .filter(shown);
  if (!fresh.length) return null;
  return [
    { key: "whats-new", hero: true, ...WHATS_NEW, items: fresh.flatMap(({ title, icon }) => (icon ? [{ title, icon }] : [])) },
    ...fresh,
    { key: "caught-up", hero: true, ...CAUGHT_UP },
  ];
}

/**
 * The revision this browser last finished: 0 if never. Before revisions the
 * key held "1", which reads as revision 1, the original tour.
 */
const seenRevision = () => {
  try {
    return Number(localStorage.getItem(SEEN_KEY) ?? 0) || 0;
  } catch {
    return Infinity; // storage blocked: don't show it on every visit
  }
};

const markSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, String(LATEST));
  } catch {
    // Not persisted.
  }
};

const ARROW_SIDE = { top: "bottom", bottom: "top", left: "right", right: "left" } as const;

/** A step's icon on the brand gradient. */
function IconTile({ icon, size = 9 }: { icon: IconType; size?: number }) {
  return (
    <Flex
      align="center"
      justify="center"
      boxSize={size}
      flexShrink={0}
      rounded="lg"
      color="white"
      shadow="sm"
      style={{ background: BRAND }}
    >
      <Icon as={icon} boxSize={size > 7 ? 4.5 : 3.5} />
    </Flex>
  );
}

export const Walkthrough = forwardRef<WalkthroughHandle, { ready: boolean }>(function Walkthrough({ ready }, ref) {
  const [cards, setCards] = useState<Card[] | null>(null); // null = closed
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const [arrowEl, setArrowEl] = useState<HTMLDivElement | null>(null);

  const current = cards?.[index];
  const el = current?.target ? target(current.target) : null;

  const { refs, floatingStyles, placement, middlewareData } = useFloating({
    placement: current?.placement,
    elements: { reference: el },
    middleware: [offset(PAD + ARROW), flip(), shift({ padding: 8, crossAxis: true }), arrow({ element: arrowEl, padding: 12 })],
    // Also keep the spotlight on the target as panels resize or scroll.
    whileElementsMounted: (reference, floating, update) =>
      autoUpdate(reference, floating, () => {
        update();
        setRect((reference as HTMLElement).getBoundingClientRect());
      }),
  });

  const open = useCallback((tour: Card[]) => {
    setCards((c) => c ?? tour);
    setIndex(0);
  }, []);

  const start = useCallback(() => {
    setCards(fullTour());
    setIndex(0);
  }, []);

  const finish = useCallback(() => {
    markSeen();
    setCards(null);
  }, []);

  useImperativeHandle(ref, () => ({ start }), [start]);

  // Once the workspace has rendered and the layout settled: the full tour on a
  // first visit, otherwise what changed since the last one (if anything).
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      const seen = seenRevision();
      const tour = seen === 0 ? fullTour() : seen < LATEST ? newsTour(seen) : null;
      if (tour) open(tour);
    }, 600);
    return () => clearTimeout(timer);
  }, [ready, open]);

  const last = cards ? index === cards.length - 1 : false;
  const next = useCallback(() => (last ? finish() : setIndex((i) => i + 1)), [last, finish]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Move focus into the card for each step, so screen readers announce it.
  useEffect(() => {
    if (current) card.current?.focus();
  }, [current]);

  // Esc skips, ←/→ step. Captured first, so the editor and app shortcuts
  // don't see keys while the tour is open.
  useEffect(() => {
    if (!cards) return;
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
  }, [cards, finish, next, back]);

  if (!cards || !current) return null;

  const news = cards[0].key === "whats-new";
  const spotlight = current.target && rect;
  const side = placement.split("-")[0] as keyof typeof ARROW_SIDE;
  const arrowData = middlewareData.arrow;
  // No arrow when the card had to move onto the target (small screens), or
  // beside a whole panel, where it would just point at the panel's middle.
  const vertical = side === "top" || side === "bottom";
  const shifted = middlewareData.shift;
  const span = rect ? (vertical ? rect.width : rect.height) : 0;
  const showArrow = !(vertical ? shifted?.y : shifted?.x) && span <= ARROW_MAX_SPAN;
  const progress = ((index + 1) / cards.length) * 100;

  return (
    <Portal>
      {/* Blocks the page; dims it unless the spotlight's shadow does. */}
      <Box
        position="fixed"
        inset="0"
        zIndex="modal"
        bg={spotlight ? "transparent" : "blackAlpha.600"}
        backdropFilter={spotlight ? undefined : "blur(3px)"}
        transition="background 0.2s"
      />
      {spotlight && (
        <Box
          position="fixed"
          zIndex="modal"
          pointerEvents="none"
          rounded="lg"
          borderWidth="2px"
          borderColor="blue.solid"
          transition="all 0.25s cubic-bezier(0.2, 0, 0, 1)"
          _motionReduce={{ transition: "none" }}
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 100vmax rgba(0, 0, 0, 0.55)",
          }}
        >
          <Box
            position="absolute"
            inset="-2px"
            rounded="lg"
            animation="tour-pulse 1.8s ease-out infinite"
            _motionReduce={{ animation: "none" }}
          />
        </Box>
      )}
      <Box
        ref={(node: HTMLDivElement | null) => {
          card.current = node;
          if (current.target) refs.setFloating(node);
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="walkthrough-title"
        aria-describedby="walkthrough-description"
        tabIndex={-1}
        zIndex="popover"
        w={current.hero ? "md" : "sm"}
        maxW="calc(100vw - 16px)"
        outline="none"
        style={
          current.target
            ? floatingStyles
            : { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
        }
      >
        {current.target && (
          <Box
            ref={setArrowEl}
            display={showArrow ? undefined : "none"}
            position="absolute"
            zIndex="1"
            w={`${ARROW}px`}
            h={`${ARROW}px`}
            bg={side === "top" ? "bg.subtle" : "bg.panel"}
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
        {/* Keyed by step, so each one animates in. */}
        <Box
          key={current.key}
          position="relative"
          bg="bg.panel"
          color="fg"
          borderWidth="1px"
          rounded="xl"
          shadow="2xl"
          overflow="hidden"
          animationName="fade-in, scale-in"
          animationDuration="moderate"
          _motionReduce={{ animation: "none" }}
        >
          <CloseButton size="2xs" position="absolute" top="2.5" right="2.5" aria-label="Close tour" onClick={finish} />

          {current.hero ? (
            <Stack align="center" textAlign="center" gap="0" px="6" pt="7" pb="5">
              <Box position="relative">
                <Logo size={52} />
                {news && index === 0 && (
                  <Flex
                    position="absolute"
                    bottom="-1.5"
                    right="-1.5"
                    boxSize="6"
                    align="center"
                    justify="center"
                    rounded="full"
                    bg="bg.panel"
                    color="purple.fg"
                    shadow="sm"
                  >
                    <LuSparkles size={13} />
                  </Flex>
                )}
              </Box>
              <Text id="walkthrough-title" fontWeight="semibold" fontSize="lg" mt="4" letterSpacing="tight">
                {current.title}
              </Text>
              <Text id="walkthrough-description" fontSize="sm" color="fg.muted" mt="1.5" lineHeight="tall">
                {current.description}
              </Text>
              {current.items && (
                <Stack gap="1.5" mt="4" w="full" textAlign="start">
                  {current.items.map((item) => (
                    <HStack key={item.title} gap="2.5" px="2.5" py="2" rounded="lg" bg="bg.subtle" borderWidth="1px">
                      <IconTile icon={item.icon} size={6} />
                      <Text fontSize="sm" fontWeight="medium" truncate>
                        {item.title}
                      </Text>
                    </HStack>
                  ))}
                </Stack>
              )}
            </Stack>
          ) : (
            <HStack align="start" gap="3" px="4" pt="4" pb="4">
              {current.icon && <IconTile icon={current.icon} />}
              <Box minW="0" pe="5">
                <HStack gap="2" mb="1" wrap="wrap">
                  <Text id="walkthrough-title" fontWeight="semibold">
                    {current.title}
                  </Text>
                  {current.fresh && (
                    <Badge size="sm" colorPalette="purple" variant="subtle" rounded="full">
                      New
                    </Badge>
                  )}
                </HStack>
                <Text id="walkthrough-description" fontSize="sm" color="fg.muted" lineHeight="tall">
                  {current.description}
                </Text>
                {current.moved && (
                  <HStack gap="1.5" mt="2" fontSize="xs" color="fg.subtle">
                    <LuSmartphone />
                    <Text>On smaller screens, find it here.</Text>
                  </HStack>
                )}
              </Box>
            </HStack>
          )}

          <Box h="3px" bg="bg.muted">
            <Box
              h="full"
              transition="width 0.3s cubic-bezier(0.2, 0, 0, 1)"
              style={{ width: `${progress}%`, background: BRAND }}
            />
          </Box>
          <Flex gap="2" px="3" py="2.5" align="center" bg="bg.subtle">
            <Text fontSize="xs" color="fg.muted" fontVariantNumeric="tabular-nums" ps="1">
              {index + 1} / {cards.length}
            </Text>
            {!last && (
              <Button size="xs" variant="ghost" color="fg.muted" ms="auto" onClick={finish}>
                Skip
              </Button>
            )}
            {index > 0 && !last && (
              <Button size="xs" variant="outline" onClick={back} aria-label="Back">
                <LuArrowLeft />
              </Button>
            )}
            <Button size="xs" colorPalette="blue" ms={last ? "auto" : undefined} onClick={next}>
              {last ? (
                <>
                  <LuCheck /> Done
                </>
              ) : (
                <>
                  {index === 0 ? (news ? "Show me" : "Start tour") : "Next"} <LuArrowRight />
                </>
              )}
            </Button>
          </Flex>
        </Box>
      </Box>
    </Portal>
  );
});
