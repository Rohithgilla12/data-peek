import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Define which routes require authentication
const isProtectedRoute = createRouteMatcher([
  '/account(.*)',
  '/api/account(.*)',
])

// Define which routes are public API endpoints (no auth needed)
const isPublicApiRoute = createRouteMatcher([
  '/api/license/(.*)',
  '/api/updates/(.*)',
  '/api/webhooks/(.*)',
  '/api/ai/(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  // Skip auth for public API routes
  if (isPublicApiRoute(req)) {
    return
  }

  // Protect dashboard routes
  if (isProtectedRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
