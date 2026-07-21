import { NextResponse } from "next/server";

// Railway's healthcheck hits this before Postgres/Redis are necessarily reachable,
// so it must never touch a plugin. Keep it dependency-free.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
