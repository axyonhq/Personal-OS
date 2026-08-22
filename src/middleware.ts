import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

/**
 * The Revolut OAuth callback is the only public route.
 *
 * Revolut redirects the browser here from its own domain, so we cannot rely on
 * a Clerk session being attached. It is protected instead by the signed `state`
 * cookie set in /api/revolut/oauth/start, which itself requires sign-in — so a
 * callback can only complete a flow this browser actually started.
 *
 * Everything else, including all other Revolut banking routes, requires auth.
 */
const isPublicRoute = createRouteMatcher(['/api/revolut/oauth/callback'])

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
