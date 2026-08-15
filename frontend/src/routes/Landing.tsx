/**
 * Public landing page.
 *
 * A placeholder until milestone 11, which builds it properly — honest copy,
 * meta tags, and a Lighthouse pass. It exists now so `/` is a real public route
 * and the routing tests are meaningful.
 */

import { Link } from 'react-router-dom'

export default function Landing() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-6">
      <h1 className="text-3xl font-semibold">
        Every junior dev job in your city, scored against your profile, in one place.
      </h1>
      <p className="text-muted">
        JobRadar reads company job boards and feeds every morning, scores each posting against a
        profile you control, and shows you why it ranked where it did.
      </p>
      <div className="flex gap-3">
        <Link
          to="/register"
          className="inline-flex min-h-[44px] items-center rounded-lg bg-accent px-5 text-sm font-medium text-white"
        >
          Get started
        </Link>
        <Link
          to="/login"
          className="inline-flex min-h-[44px] items-center rounded-lg border border-hairline px-5 text-sm font-medium"
        >
          Sign in
        </Link>
      </div>
    </main>
  )
}
