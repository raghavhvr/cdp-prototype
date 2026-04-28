// Realistic dummy data generator.
// Produces events that mirror typical lottery/draw funnel behavior, with
// intentional variety so all segments populate meaningfully during demos.
//
// Funnel ratios (target distribution after generation):
// - 50% low engagement bouncers (validates suppression logic)
// - 25% engaged browsers
// - 10% high intent anonymous
// - 6% started registration (didn't complete)
// - 4% abandoned cart
// - 3% converted
// - 2% ineligible (geo)

interface EventRow {
  anonymous_id: string;
  user_id: string | null;
  event_type: string;
  occurred_at: string;
  session_id: string;
  page_path?: string | null;
  page_category?: string | null;
  game_name?: string | null;
  registration_step?: string | null;
  cart_value_aed?: number | null;
  scroll_depth_pct?: number | null;
  dwell_seconds?: number | null;
  country_code?: string | null;
  is_eligible?: boolean;
  metadata?: Record<string, unknown> | null;
}

const GAMES = ["mega7", "easy6", "fast5", "raffle"];
const ELIGIBLE_COUNTRIES = ["AE", "SA", "KW", "QA", "BH", "OM", "IN", "PK"];
const INELIGIBLE_COUNTRIES = ["US", "FR", "DE", "SG"];
const REGISTRATION_STEPS = ["otp", "personal_details", "eligibility"];

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedChoice<T>(items: { value: T; weight: number }[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.value;
  }
  return items[0].value;
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function daysAgo(days: number, jitterHours = 24): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - Math.random() * jitterHours);
  return d;
}

interface UserPersona {
  type:
    | "bouncer"
    | "engaged_browser"
    | "high_intent"
    | "started_registration"
    | "abandoned_cart"
    | "converted"
    | "ineligible";
  weight: number;
}

const PERSONAS: UserPersona[] = [
  { type: "bouncer", weight: 50 },
  { type: "engaged_browser", weight: 25 },
  { type: "high_intent", weight: 10 },
  { type: "started_registration", weight: 6 },
  { type: "abandoned_cart", weight: 4 },
  { type: "converted", weight: 3 },
  { type: "ineligible", weight: 2 },
];

/**
 * Generate events for a single user according to their persona.
 */
function generateUserEvents(persona: UserPersona["type"]): EventRow[] {
  const anonymousId = randomId("anon");
  const events: EventRow[] = [];
  const isIneligible = persona === "ineligible";
  const country = isIneligible
    ? randomChoice(INELIGIBLE_COUNTRIES)
    : randomChoice(ELIGIBLE_COUNTRIES);
  const isEligible = !isIneligible;
  const preferredGame = randomChoice(GAMES);

  const pushEvent = (
    daysBack: number,
    sessionId: string,
    eventType: string,
    extras: Partial<EventRow> = {}
  ) => {
    events.push({
      anonymous_id: anonymousId,
      user_id: null,
      event_type: eventType,
      occurred_at: daysAgo(daysBack, 12).toISOString(),
      session_id: sessionId,
      country_code: country,
      is_eligible: isEligible,
      ...extras,
    });
  };

  switch (persona) {
    case "bouncer": {
      // Single session, single page view, sub-30 second dwell
      const session = randomId("ses");
      const days = Math.random() * 14;
      pushEvent(days, session, "session_start");
      pushEvent(days, session, "page_view", {
        page_path: "/",
        page_category: "home",
        dwell_seconds: Math.floor(Math.random() * 25) + 5,
        scroll_depth_pct: Math.floor(Math.random() * 30),
      });
      break;
    }

    case "engaged_browser": {
      // 1-3 sessions, multiple meaningful page views, decent dwell
      const sessionCount = Math.floor(Math.random() * 3) + 1;
      for (let s = 0; s < sessionCount; s++) {
        const session = randomId("ses");
        const days = Math.random() * 21 + s * 2;
        pushEvent(days, session, "session_start");
        const pageCount = Math.floor(Math.random() * 3) + 2;
        for (let p = 0; p < pageCount; p++) {
          const category = weightedChoice([
            { value: "game", weight: 3 },
            { value: "results", weight: 2 },
            { value: "winners", weight: 2 },
            { value: "promo", weight: 1 },
            { value: "home", weight: 2 },
          ]);
          pushEvent(days, session, "page_view", {
            page_path: `/${category}`,
            page_category: category,
            game_name: category === "game" ? preferredGame : null,
            dwell_seconds: Math.floor(Math.random() * 60) + 30,
            scroll_depth_pct: Math.floor(Math.random() * 60) + 20,
          });
          if (category === "game") {
            pushEvent(days, session, "game_view", {
              game_name: preferredGame,
              page_category: "game",
              dwell_seconds: Math.floor(Math.random() * 90) + 30,
            });
          }
        }
      }
      break;
    }

    case "high_intent": {
      // 2-4 sessions, deep dwell, multiple game views, no registration
      const sessionCount = Math.floor(Math.random() * 3) + 2;
      for (let s = 0; s < sessionCount; s++) {
        const session = randomId("ses");
        const days = Math.random() * 14 + s * 3;
        pushEvent(days, session, "session_start");
        // Always view at least one game
        pushEvent(days, session, "page_view", {
          page_path: `/games/${preferredGame}`,
          page_category: "game",
          game_name: preferredGame,
          dwell_seconds: Math.floor(Math.random() * 120) + 60,
          scroll_depth_pct: Math.floor(Math.random() * 40) + 60,
        });
        pushEvent(days, session, "game_view", {
          game_name: preferredGame,
          page_category: "game",
          dwell_seconds: Math.floor(Math.random() * 90) + 30,
        });
        // View results / pricing
        if (Math.random() > 0.4) {
          pushEvent(days, session, "page_view", {
            page_path: "/results",
            page_category: "results",
            dwell_seconds: Math.floor(Math.random() * 60) + 30,
            scroll_depth_pct: Math.floor(Math.random() * 40) + 50,
          });
          pushEvent(days, session, "results_view", {
            page_category: "results",
            dwell_seconds: Math.floor(Math.random() * 40) + 20,
          });
        }
      }
      break;
    }

    case "started_registration": {
      // Engaged browsing → registration started → dropped off mid-flow
      const session = randomId("ses");
      const days = Math.random() * 10;
      pushEvent(days, session, "session_start");
      pushEvent(days, session, "page_view", {
        page_path: `/games/${preferredGame}`,
        page_category: "game",
        game_name: preferredGame,
        dwell_seconds: 90,
        scroll_depth_pct: 70,
      });
      pushEvent(days, session, "game_view", { game_name: preferredGame, page_category: "game" });
      pushEvent(days, session, "registration_start", { page_category: "registration" });
      const dropStep = randomChoice(REGISTRATION_STEPS);
      pushEvent(days, session, "registration_step", {
        page_category: "registration",
        registration_step: dropStep,
        dwell_seconds: Math.floor(Math.random() * 60) + 30,
      });
      break;
    }

    case "abandoned_cart": {
      // Browsed → registered → added to cart → didn't complete
      const days = Math.random() * 5 + 1; // recent so they qualify (within 7-day cart window)
      const session = randomId("ses");
      pushEvent(days + 1, session, "session_start");
      pushEvent(days + 1, session, "page_view", {
        page_path: `/games/${preferredGame}`,
        page_category: "game",
        game_name: preferredGame,
        dwell_seconds: 120,
        scroll_depth_pct: 80,
      });
      pushEvent(days + 1, session, "game_view", { game_name: preferredGame, page_category: "game" });
      // Some abandoned carts are anonymous, some have started registration
      if (Math.random() > 0.5) {
        pushEvent(days, session, "registration_start", { page_category: "registration" });
        pushEvent(days, session, "registration_complete", { page_category: "registration" });
      }
      pushEvent(days, session, "cart_add", {
        page_category: "cart",
        game_name: preferredGame,
        cart_value_aed: Math.floor(Math.random() * 200) + 50,
      });
      pushEvent(days, session, "cart_view", { page_category: "cart" });
      // Some go to checkout but bail
      if (Math.random() > 0.5) {
        pushEvent(days, session, "checkout_start", { page_category: "checkout" });
      }
      break;
    }

    case "converted": {
      // Full funnel: browse → register → cart → purchase
      const userId = randomId("user");
      const days = Math.random() * 60 + 5;
      const session1 = randomId("ses");
      const session2 = randomId("ses");

      pushEvent(days, session1, "session_start");
      pushEvent(days, session1, "page_view", {
        page_path: `/games/${preferredGame}`,
        page_category: "game",
        game_name: preferredGame,
        dwell_seconds: 100,
        scroll_depth_pct: 75,
      });
      pushEvent(days, session1, "game_view", { game_name: preferredGame, page_category: "game" });
      pushEvent(days, session1, "registration_start", { page_category: "registration" });
      pushEvent(days - 0.1, session1, "registration_complete", {
        page_category: "registration",
      });

      // Subsequent purchase session (with user_id now)
      const purchaseValue = Math.floor(Math.random() * 250) + 50;
      const completedAt = daysAgo(days - 0.5, 6).toISOString();
      events.push({
        anonymous_id: anonymousId,
        user_id: userId,
        event_type: "session_start",
        occurred_at: completedAt,
        session_id: session2,
        country_code: country,
        is_eligible: true,
      });
      events.push({
        anonymous_id: anonymousId,
        user_id: userId,
        event_type: "cart_add",
        occurred_at: completedAt,
        session_id: session2,
        page_category: "cart",
        game_name: preferredGame,
        cart_value_aed: purchaseValue,
        country_code: country,
        is_eligible: true,
      });
      events.push({
        anonymous_id: anonymousId,
        user_id: userId,
        event_type: "purchase",
        occurred_at: completedAt,
        session_id: session2,
        page_category: "checkout",
        game_name: preferredGame,
        cart_value_aed: purchaseValue,
        country_code: country,
        is_eligible: true,
      });
      break;
    }

    case "ineligible": {
      // Visited from outside eligible region — single session
      const session = randomId("ses");
      const days = Math.random() * 14;
      pushEvent(days, session, "session_start");
      pushEvent(days, session, "page_view", {
        page_path: "/",
        page_category: "home",
        dwell_seconds: Math.floor(Math.random() * 60) + 20,
        scroll_depth_pct: Math.floor(Math.random() * 50),
      });
      // They might browse a bit
      if (Math.random() > 0.5) {
        pushEvent(days, session, "page_view", {
          page_path: `/games/${preferredGame}`,
          page_category: "game",
          game_name: preferredGame,
          dwell_seconds: 40,
          scroll_depth_pct: 50,
        });
      }
      break;
    }
  }

  return events;
}

/**
 * Generate a complete dataset of events for the prototype.
 * @param userCount Total number of users to simulate (default 1000)
 */
export function generateDataset(userCount = 1000): EventRow[] {
  const events: EventRow[] = [];

  const totalWeight = PERSONAS.reduce((s, p) => s + p.weight, 0);

  for (let i = 0; i < userCount; i++) {
    const persona = weightedChoice(
      PERSONAS.map((p) => ({ value: p.type, weight: p.weight }))
    );
    events.push(...generateUserEvents(persona));
  }

  // Shuffle for realism (events arrive interleaved)
  for (let i = events.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [events[i], events[j]] = [events[j], events[i]];
  }

  return events;
}
