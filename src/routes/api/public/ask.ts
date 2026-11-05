import { createFileRoute } from "@tanstack/react-router";
import { handleAsk } from "@/lib/ai/ask.server";

// Public by design: only aggregate, suppressed statistics are sent to the model.
export const Route = createFileRoute("/api/public/ask")({
  server: { handlers: { POST: ({ request }) => handleAsk(request) } },
});
