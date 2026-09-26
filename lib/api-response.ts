import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export function validationError(error: ZodError) {
  return errorResponse(error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "), 400);
}

export function parseError(error: unknown, fallback = "Request failed") {
  if (error instanceof ZodError) return validationError(error);
  return errorResponse(fallback, 500);
}
