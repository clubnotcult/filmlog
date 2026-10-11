Browser regression harness for the review workflow (frame-to-frame navigation).

`mock.js` is a tiny in-memory stand-in for Supabase Auth + PostgREST (two rolls, one with missing frame numbers and
non-sequential ids). Run the real app against it and drive it with Chromium:

    node mock.js &                                   # LAT=300 adds per-request latency
    NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon \
      NEXT_PUBLIC_GOOGLE_CLIENT_ID=x NEXT_PUBLIC_GOOGLE_API_KEY=x NEXT_PUBLIC_GOOGLE_APP_ID=1 npm run build
    npx next start -p 3100 &
    npm i --no-save playwright-core && node roll.js 100   # whole roll, marking + Next
    node explore.js                                      # Explore across a roll boundary
    node missing.js                                      # recovery page for a missing frame
