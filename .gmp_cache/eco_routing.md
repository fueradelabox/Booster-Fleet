# Specify Eco-Friendly Routing for a Routes Request

This reference covers configuring a Routes API `computeRoutes` request to
calculate an eco-friendly (fuel-efficient or energy-efficient) route based on
the vehicle's engine type, as well as optimizing waypoint order for multi-stop
efficiency.

## Prerequisites

-   An active Google Cloud project with the **Routes API** enabled.
-   A valid API Key with permissions to call the Routes API.
-   A baseline `computeRoutes` request structure (Origin and Destination
    defined).

--------------------------------------------------------------------------------

## 1. Requesting an Eco-Friendly Route (Fuel-Efficient Routing)

To calculate the most fuel- or energy-efficient route, configure your
`computeRoutes` request with the following settings:

1.  **Set `travelMode`**: Must be set to `"DRIVE"` (eco-friendly routing is only
    supported for driving).
2.  **Set `routingPreference`**: Must be set to `"TRAFFIC_AWARE_OPTIMAL"`. In
    this mode, the Routes API performs an exhaustive search of the road network
    to find the optimal fuel-efficient route alongside the fastest route.
3.  **Specify `vehicleInfo.emissionType`**: Define the vehicle's engine type
    inside `routeModifiers.vehicleInfo`:
    -   `GASOLINE` — Gas-powered vehicle.
    -   `ELECTRIC` — Electric vehicle (EV).
    -   `HYBRID` — Hybrid electric/gas vehicle.
    -   `DIESEL` — Diesel-powered vehicle.
4.  **Enable `requestedReferenceRoutes`**: Include `["FUEL_EFFICIENT"]` in the
    `requestedReferenceRoutes` array.
5.  **Specify `extraComputations`**: Include `["FUEL_CONSUMPTION"]` in the
    `extraComputations` array if you want estimated fuel/energy usage in the
    response.
6.  **Configure `X-Goog-FieldMask` Header**: You must explicitly request the
    eco-friendly route labels and fuel consumption data in the response field
    mask:
    -   `routes.routeLabels` (identifies which route is `FUEL_EFFICIENT` vs
        `DEFAULT_ROUTE`).
    -   `routes.travelAdvisory.fuelConsumptionMicroliters` (returns estimated
        fuel consumption).
    -   `routes.routeToken` (optional, if passing the route to the Navigation
        SDK).

### Eco-Friendly Route Example (REST)

```bash
curl -X POST 'https://routes.googleapis.com/directions/v2:computeRoutes' \
  -H 'Content-Type: application/json' \
  -H 'X-Goog-Api-Key: YOUR_API_KEY' \
  -H 'X-Goog-Maps-Solution-ID: gmp_git_agentskills_v1' \
  -H 'X-Goog-FieldMask: routes.duration,routes.distanceMeters,routes.routeLabels,routes.travelAdvisory.fuelConsumptionMicroliters,routes.polyline.encodedPolyline' \
  -d '{
    "origin": {
      "address": "1600 Amphitheatre Pkwy, Mountain View, CA"
    },
    "destination": {
      "address": "1 Market St, San Francisco, CA"
    },
    "travelMode": "DRIVE",
    "routingPreference": "TRAFFIC_AWARE_OPTIMAL",
    "extraComputations": [
      "FUEL_CONSUMPTION"
    ],
    "routeModifiers": {
      "vehicleInfo": {
        "emissionType": "GASOLINE"
      }
    },
    "requestedReferenceRoutes": [
      "FUEL_EFFICIENT"
    ]
  }'
```

### Understanding the Eco-Friendly Response

The API returns up to two routes in the `routes` array, identified by
`routeLabels`:

-   `"DEFAULT_ROUTE"`: The fastest route without fuel optimization.
-   `"FUEL_EFFICIENT"`: The route optimized for the lowest fuel or energy usage.
-   If the fastest route is also the most fuel-efficient route, a single route
    is returned with both `"DEFAULT_ROUTE"` and `"FUEL_EFFICIENT"` in its
    `routeLabels` array.

--------------------------------------------------------------------------------

## 2. Optimizing Multi-Stop Waypoints for Efficiency

If your route has multiple intermediate stops (`intermediates`) and you want the
Routes API to rearrange the stops into the most efficient travel order, use
**Waypoint Optimization**.

> **Important Constraint:** You **cannot** combine `optimizeWaypointOrder: true`
> with `routingPreference: "TRAFFIC_AWARE_OPTIMAL"`. Therefore, waypoint order
> optimization and `FUEL_EFFICIENT` reference routing cannot be used in the
> exact same API call.

### Rules for Waypoint Optimization

1.  **No `via` Waypoints**: Make sure none of the intermediate waypoints have
    `"via": true` (e.g., `{"address": "Clare,SA", "via": true}` is not allowed).
    All intermediates must be stopover waypoints.
2.  **Routing Preference**: Make sure `routingPreference` is **not** set to
    `TRAFFIC_AWARE_OPTIMAL` (use `TRAFFIC_AWARE` or `TRAFFIC_UNAWARE`).
3.  **Enable Optimization**: Set `"optimizeWaypointOrder": true` in the request
    body.
4.  **Update the Field Mask**: Include
    `routes.optimizedIntermediateWaypointIndex` in the `X-Goog-FieldMask` header
    so the response returns the rearranged index order.

### Waypoint Optimization Example (REST)

This request optimizes a route starting and ending in Adelaide, South Australia,
visiting four wine regions in the most efficient order:

```bash
curl -X POST 'https://routes.googleapis.com/directions/v2:computeRoutes' \
  -H 'Content-Type: application/json' \
  -H 'X-Goog-Api-Key: YOUR_API_KEY' \
  -H 'X-Goog-Maps-Solution-ID: gmp_git_agentskills_v1' \
  -H 'X-Goog-FieldMask: routes.duration,routes.distanceMeters,routes.optimizedIntermediateWaypointIndex,geocodingResults.intermediates.intermediateWaypointRequestIndex' \
  -d '{
    "origin": {
      "address": "Adelaide,SA"
    },
    "destination": {
      "address": "Adelaide,SA"
    },
    "intermediates": [
      {"address": "Barossa+Valley,SA"},
      {"address": "Clare,SA"},
      {"address": "Coonawarra,SA"},
      {"address": "McLaren+Vale,SA"}
    ],
    "travelMode": "DRIVE",
    "optimizeWaypointOrder": true
  }'
```

### Understanding the Optimized Order Response

1.  The Routes API indexes the `intermediates` array from your request starting
    at `0`:
    -   `0`: `{"address": "Barossa+Valley,SA"}`
    -   `1`: `{"address": "Clare,SA"}`
    -   `2`: `{"address": "Coonawarra,SA"}`
    -   `3`: `{"address": "McLaren+Vale,SA"}`
2.  The API returns the optimized sequence in
    `routes.optimizedIntermediateWaypointIndex`:

```json
{
  "routes": [
    {
      "distanceMeters": 1152430,
      "duration": "46210s",
      "optimizedIntermediateWaypointIndex": [
        3,
        2,
        0,
        1
      ]
    }
  ]
}
```

--------------------------------------------------------------------------------

## Billing and Pricing Notes

-Both `requestedReferenceRoutes: ["FUEL_EFFICIENT"]` and `optimizeWaypointOrder:
true` are advanced capabilities billed at a higher rate under the **Compute
Routes Pro** or **Compute Routes Enterprise** SKUs. Ensure your project budget
accounts for these higher-tier features.
