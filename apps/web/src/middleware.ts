import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Routes that require a signed-in user. Kept as a check separate from the `matcher`
// below on purpose: the matcher decides what Clerk sees at all, this decides what it
// protects. If the matcher is ever widened, nothing becomes protected by accident.
const isProtectedRoute = createRouteMatcher([
  "/account(.*)",
  "/api/account(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  // Only the authenticated surface.
  //
  // This previously matched every page and API route except Next internals and static
  // files, so every marketing request paid a Clerk round trip for nothing. Worse,
  // Clerk answers 400 "Invalid host" whenever it cannot attribute the publishable key
  // to a real instance — so a bad or missing key took down the entire site rather
  // than just the signed-in area.
  //
  // Safe to narrow because nothing outside these routes touches Clerk: there is no
  // auth() or currentUser() call anywhere in the app, and <ClerkProvider> in
  // app/layout.tsx is static (no `dynamic` prop), so it renders without middleware
  // having run. The former `isPublicApiRoute` early-return is gone with it — those
  // routes are simply no longer matched, so the check was unreachable.
  //
  // Two things to remember as the authenticated area grows: a page or route handler
  // that calls auth() or currentUser() must be listed here or it will throw, and
  // Clerk's handshake can only be processed on a matched path — so any post-sign-in
  // landing route belongs here too.
  matcher: ["/account(.*)", "/api/account(.*)"],
};
