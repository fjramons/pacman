# Gateway API (next step, not applied by default)

Prepares the ground for exposing the app through [Gateway API](https://gateway-api.sigs.k8s.io/) instead of `k8s/base/service.yaml`'s `Service type=LoadBalancer` (still the current, short-term way to reach it). Not applied by the default deploy command in `k8s/README.md`.

`httproute.yaml` routes traffic to the same `pacman-app` Service (`HTTPRoute` adds a second way in, doesn't replace the first). Needs two values via `envsubst`:

- `GATEWAY_NAME` / `GATEWAY_NAMESPACE`: the `Gateway` resource in the target cluster. Find it with `kubectl get gateway -A`.

```bash
GATEWAY_NAME=... GATEWAY_NAMESPACE=... envsubst < k8s/gateway-api/httproute.yaml | kubectl apply -f -
```

In the local `saas cluster create --name app --expose-mode gateway-api` environment: `GATEWAY_NAME=app-gw GATEWAY_NAMESPACE=default`.

Not verified against a real production cluster's own Gateway API setup: confirm the actual name/namespace there before relying on this manifest outside local testing.
