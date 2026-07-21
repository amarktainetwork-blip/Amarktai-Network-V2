// Unit tests must mock the repository/service boundary. MariaDB-backed tests
// opt in explicitly and run against the real-service fixture stack.
process.env.AMARKTAI_UNIT_TEST = '1'

// The production worker imports this registration during bootstrap. Unit tests
// that inspect the callable handler map must initialise the same canonical map.
await import('../apps/worker/src/providers/vision-handler-registration.js')
