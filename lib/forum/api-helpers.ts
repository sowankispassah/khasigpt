import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { ChatSDKError } from "@/lib/errors";

export function forumErrorResponse(error: unknown) {
  if (error instanceof ChatSDKError) {
    return error.toResponse();
  }

  if (error instanceof ZodError) {
    const details = error.flatten();
    return NextResponse.json(
      {
        code: "bad_request:api",
        message: "One or more fields are invalid.",
        details,
      },
      { status: 422 }
    );
  }

  console.error("[forum] API error", error);

  return NextResponse.json(
    {
      code: "bad_request:api",
      message: "Unable to process the request right now. Please try again later.",
    },
    { status: 500 }
  );
}

export function forumDisabledResponse() {
  return NextResponse.json(
    {
      code: "forum:disabled",
      message: "The community forum is currently unavailable.",
    },
    { status: 404 }
  );
}
