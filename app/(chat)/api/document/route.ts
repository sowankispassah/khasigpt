const disabledResponse = Response.json(
  { error: "Document API is disabled in this deployment." },
  { status: 410 }
);

export function GET() {
  return disabledResponse;
}

export function POST() {
  return disabledResponse;
}

export function DELETE() {
  return disabledResponse;
}
