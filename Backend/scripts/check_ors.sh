#!/usr/bin/env bash
# Simple script to validate ORS API key availability for routing and geocoding
set -euo pipefail

if [ -z "${ORS_API_KEY-}" ]; then
  echo "ERROR: ORS_API_KEY not set in environment. Export it first: export ORS_API_KEY=\"your_key\""
  exit 2
fi

echo "Testing OpenRouteService Directions (routing) API..."
curl -s -S -w "\nHTTP_STATUS:%{http_code}\n" \
  -X POST "https://api.openrouteservice.org/v2/directions/driving-car/geojson" \
  -H "Content-Type: application/json" \
  -H "Authorization: ${ORS_API_KEY}" \
  -d '{"coordinates":[[-47.4621,-23.4926],[-47.4621,-23.5153]]}' | sed -n '1,200p'

echo "\nTesting OpenRouteService Geocoding API..."
curl -s -S -G "https://api.openrouteservice.org/geocode/search" \
  -H "Authorization: ${ORS_API_KEY}" \
  --data-urlencode "text=-23.4926, -47.4621" \
  --data-urlencode "boundary.country=BRA" \
  --data-urlencode "size=1" | sed -n '1,200p'

echo "\nDone. If you received HTTP_STATUS:200 and JSON responses, the key is valid for these endpoints."
