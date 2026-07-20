#!/usr/bin/env bash
# Least-privilege Nginx configuration validation for production activation.
# The full deployment remains unprivileged; only `nginx -t` receives sudo
# because production TLS certificate files are intentionally root-readable.
set -Eeuo pipefail

validate_nginx_configuration() {
  local output status

  command -v nginx >/dev/null || {
    echo 'ERROR: nginx is not installed or is not available on PATH' >&2
    return 2
  }

  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    set +e
    output="$(nginx -t 2>&1)"
    status=$?
    set -e
  else
    command -v sudo >/dev/null || {
      echo 'ERROR: sudo is required to validate the root-readable production TLS configuration' >&2
      return 2
    }
    sudo -v || {
      echo 'ERROR: sudo authentication failed; Nginx configuration was not validated' >&2
      return 2
    }
    set +e
    output="$(sudo nginx -t 2>&1)"
    status=$?
    set -e
  fi

  printf '%s\n' "$output"

  if [[ "$status" -ne 0 ]]; then
    echo 'ERROR: Nginx configuration test failed' >&2
    return "$status"
  fi

  if grep -Eq '\[(warn|alert|emerg|crit)\]' <<<"$output"; then
    echo 'ERROR: Nginx configuration test emitted warnings or errors; production activation requires clean output' >&2
    return 2
  fi

  grep -Fq 'syntax is ok' <<<"$output" || {
    echo 'ERROR: Nginx did not confirm that configuration syntax is valid' >&2
    return 2
  }
  grep -Fq 'test is successful' <<<"$output" || {
    echo 'ERROR: Nginx did not confirm a successful configuration test' >&2
    return 2
  }

  echo '[preflight] Nginx configuration: clean'
}
