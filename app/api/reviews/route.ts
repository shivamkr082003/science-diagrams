import { getConcept } from "@/lib/concepts";
import { getReviews, saveReview, serverCanSave, storageName } from "@/lib/reviews";


export async function GET() {
  try {
    if (!serverCanSave()) return Response.json({ reviews: {}, storage: null, serverCanSave: false });
    return Response.json({ reviews: await getReviews(), storage: storageName(), serverCanSave: true });
  } catch (err) {
    return Response.json({ error: `Could not load reviews: ${(err as Error).message}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { conceptId, status, note } = body ?? {};

  if (typeof conceptId !== "string" || !getConcept(conceptId)) {
    return Response.json({ error: "Unknown conceptId." }, { status: 400 });
  }
  if (status !== "approved" && status !== "rejected") {
    return Response.json({ error: 'status must be "approved" or "rejected".' }, { status: 400 });
  }
  if (note !== undefined && (typeof note !== "string" || note.length > 2000)) {
    return Response.json({ error: "note must be text, at most 2000 characters." }, { status: 400 });
  }

  try {
    const review = await saveReview(conceptId, status, note ?? "");
    return Response.json({ review });
  } catch (err) {
    return Response.json({ error: `Could not save review: ${(err as Error).message}` }, { status: 500 });
  }
}
