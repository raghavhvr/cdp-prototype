// Realistic dummy data generator.
// Produces events that mirror typical lottery/draw funnel behavior.
// Tuned so all segments populate meaningfully during demos.

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
    | "promo_viewer"
    | "winner_validator"
    | "repeat_visitor"
    | "reg_drop_otp"
    | "reg_drop_details"
    | "reg_drop_eligibility"
    | "abandoned_cart_high"
    | "abandoned_cart_standard"
    | "converted"
    | "lapsed_customer"
    | "ineligible";
  weight: number;
}

// Tuned so every segment gets meaningful population for demos
const PERSONAS: UserPersona[] = [
  { type: "bouncer", weight: 35 },
  { type: "engaged_browser", weight: 18 },
  { type: "high_intent", weight: 8 },
  { type: "promo_viewer", weight: 5 },
  { type: "winner_validator", weight: 5 },
  { type: "repeat_visitor", weight: 5 },
  { type: "reg_drop_otp", weight: 3 },
  { type: "reg_drop_details", weight: 3 },
  { type: "reg_drop_eligibility", weight: 2 },
  { type: "abandoned_cart_high", weight: 2 },
  { type: "abandoned_cart_standard", weight: 4 },
  { type: "converted", weight: 4 },
  { type: "lapsed_customer", weight: 4 },
  { type: "ineligible", weight: 2 },
];

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
      const sessionCount = Math.floor(Math.random() * 2) + 1;
      for (let s = 0; s < sessionCount; s++) {
        const session = randomId("ses");
        const days = Math.random() * 21 + s * 2;
        pushEvent(days, session, "session_start");
        const pageCount = Math.floor(Math.random() * 3) + 2;
        for (let p = 0; p < pageCount; p++) {
          const category = weightedChoice([
            { value: "game", weight: 3 },
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
      const sessionCount = Math.floor(Math.random() * 3) + 2;
      for (let s = 0; s < sessionCount; s++) {
        const session = randomId("ses");
        const days = Math.random() * 7 + s * 1.5; // recent activity
        pushEvent(days, session, "session_start");
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
      }
      break;
    }

    case "promo_viewer": {
      const session = randomId("ses");
      const days = Math.random() * 10;
      pushEvent(days, session, "session_start");
      pushEvent(days, session, "page_view", {
        page_path: "/promotions",
        page_category: "promo",
        dwell_seconds: 60,
        scroll_depth_pct: 70,
      });
      pushEvent(days, session, "promo_view", {
        page_category: "promo",
        dwell_seconds: 45,
      });
      // Some promo viewers also browse a game
      if (Math.random() > 0.5) {
        pushEvent(days, session, "game_view", {
          game_name: preferredGame,
          page_category: "game",
          dwell_seconds: 40,
        });
      }
      break;
    }

    case "winner_validator": {
      const sessionCount = Math.floor(Math.random() * 2) + 1;
      for (let s = 0; s < sessionCount; s++) {
        const session = randomId("ses");
        const days = Math.random() * 14 + s * 2;
        pushEvent(days, session, "session_start");
        // Multiple winner / results page views
        const viewCount = Math.floor(Math.random() * 3) + 2;
        for (let v = 0; v < viewCount; v++) {
          const type = Math.random() > 0.5 ? "winners_view" : "results_view";
          const category = type === "winners_view" ? "winners" : "results";
          pushEvent(days, session, "page_view", {
            page_path: `/${category}`,
            page_category: category,
            dwell_seconds: 40 + Math.floor(Math.random() * 40),
            scroll_depth_pct: 50 + Math.floor(Math.random() * 40),
          });
          pushEvent(days, session, type, {
            page_category: category,
            dwell_seconds: 30 + Math.floor(Math.random() * 30),
          });
        }
      }
      break;
    }

    case "repeat_visitor": {
      // 3+ sessions, diverse pages, no progression
      const sessionCount = Math.floor(Math.random() * 3) + 3;
      for (let s = 0; s < sessionCount; s++) {
        const session = randomId("ses");
        const days = Math.random() * 21 + s * 2;
        pushEvent(days, session, "session_start");
        pushEvent(days, session, "page_view", {
          page_path: "/",
          page_category: "home",
          dwell_seconds: Math.floor(Math.random() * 60) + 30,
          scroll_depth_pct: Math.floor(Math.random() * 50) + 30,
        });
      }
      break;
    }

    case "reg_drop_otp":
    case "reg_drop_details":
    case "reg_drop_eligibility": {
      const dropStep =
        persona === "reg_drop_otp"
          ? "otp"
          : persona === "reg_drop_details"
          ? "personal_details"
          : "eligibility";
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
      pushEvent(days, session, "game_view", {
        game_name: preferredGame,
        page_category: "game",
      });
      pushEvent(days, session, "registration_start", { page_category: "registration" });
      // Walk through any earlier steps before stopping at drop step
      if (dropStep === "personal_details" || dropStep === "eligibility") {
        pushEvent(days, session, "registration_step", {
          page_category: "registration",
          registration_step: "otp",
          dwell_seconds: 30,
        });
      }
      if (dropStep === "eligibility") {
        pushEvent(days, session, "registration_step", {
          page_category: "registration",
          registration_step: "personal_details",
          dwell_seconds: 60,
        });
      }
      pushEvent(days, session, "registration_step", {
        page_category: "registration",
        registration_step: dropStep,
        dwell_seconds: Math.floor(Math.random() * 60) + 30,
      });
      break;
    }

    case "abandoned_cart_high":
    case "abandoned_cart_standard": {
      const days = Math.random() * 5 + 1; // recent so they qualify
      const session = randomId("ses");
      pushEvent(days + 1, session, "session_start");
      pushEvent(days + 1, session, "page_view", {
        page_path: `/games/${preferredGame}`,
        page_category: "game",
        game_name: preferredGame,
        dwell_seconds: 120,
        scroll_depth_pct: 80,
      });
      pushEvent(days + 1, session, "game_view", {
        game_name: preferredGame,
        page_category: "game",
      });
      // High value: AED 200-450; Standard: AED 30-180
      const cartValue =
        persona === "abandoned_cart_high"
          ? Math.floor(Math.random() * 250) + 200
          : Math.floor(Math.random() * 150) + 30;
      pushEvent(days, session, "cart_add", {
        page_category: "cart",
        game_name: preferredGame,
        cart_value_aed: cartValue,
      });
      pushEvent(days, session, "cart_view", { page_category: "cart" });
      if (Math.random() > 0.5) {
        pushEvent(days, session, "checkout_start", { page_category: "checkout" });
      }
      break;
    }

    case "converted": {
      const userId = randomId("user");
      const days = Math.random() * 25 + 2; // active recent customers
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
      pushEvent(days, session1, "game_view", {
        game_name: preferredGame,
        page_category: "game",
      });
      pushEvent(days, session1, "registration_start", { page_category: "registration" });
      pushEvent(days - 0.1, session1, "registration_complete", {
        page_category: "registration",
      });

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

    case "lapsed_customer": {
      // Like converted, but last activity 30+ days ago
      const userId = randomId("user");
      const lapsedDays = Math.floor(Math.random() * 60) + 35; // 35-95 days ago
      const session1 = randomId("ses");
      const session2 = randomId("ses");

      pushEvent(lapsedDays + 1, session1, "session_start");
      pushEvent(lapsedDays + 1, session1, "page_view", {
        page_path: `/games/${preferredGame}`,
        page_category: "game",
        game_name: preferredGame,
        dwell_seconds: 100,
      });
      pushEvent(lapsedDays + 1, session1, "registration_complete", {
        page_category: "registration",
      });

      const purchaseValue = Math.floor(Math.random() * 200) + 50;
      const completedAt = daysAgo(lapsedDays, 6).toISOString();
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
      const session = randomId("ses");
      const days = Math.random() * 14;
      pushEvent(days, session, "session_start");
      pushEvent(days, session, "page_view", {
        page_path: "/",
        page_category: "home",
        dwell_seconds: Math.floor(Math.random() * 60) + 20,
        scroll_depth_pct: Math.floor(Math.random() * 50),
      });
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

export function generateDataset(userCount = 1000): EventRow[] {
  const events: EventRow[] = [];

  for (let i = 0; i < userCount; i++) {
    const persona = weightedChoice(
      PERSONAS.map((p) => ({ value: p.type, weight: p.weight }))
    );
    events.push(...generateUserEvents(persona));
  }

  // Shuffle for realism
  for (let i = events.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [events[i], events[j]] = [events[j], events[i]];
  }

  return events;
}
