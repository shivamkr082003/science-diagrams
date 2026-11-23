// The "Generate" button: runs Part A live for one concept.
// The result is returned to the browser, not saved: results.json stays the reviewed baseline.
import { getConcept } from "@/lib/concepts";
import { generateDiagram } from "@/lib/pipeline";

// Up to 2 model calls plus 429/503 backoff can take a while.
export const maxDuration = 120;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const concept = typeof body?.conceptId === "string" ? getConcept(body.conceptId) : undefined;
  if (!concept) return Response.json({ error: "Unknown conceptId." }, { status: 400 });

  try {
    const result = await generateDiagram(concept);
    if (result.error) {
      // The model API failed and we have no diagram: send the reason and the cost/retry log.
      return Response.json({ error: result.error, result }, { status: 502 });
    }
    return Response.json({ result });
  } catch (err) {
    console.error("[generate] unexpected error", err);
    return Response.json({ error: `Unexpected server error: ${(err as Error).message}` }, { status: 500 });
  }
}
