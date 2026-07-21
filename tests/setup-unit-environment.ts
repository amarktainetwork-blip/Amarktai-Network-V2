// Unit tests must mock the repository/service boundary. MariaDB-backed tests
// opt in explicitly and run against the real-service fixture stack.
process.env.AMARKTAI_UNIT_TEST = '1'
