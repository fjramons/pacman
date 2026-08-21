# Gateway API (next step, not applied by default)

`k8s/base/service.yaml` exposes the app via a `Service` of type `LoadBalancer`, which is the current, short-term way to reach it. This directory prepares the ground for exposing it through [Gateway API](https://gateway-api.sigs.k8s.io/) instead, once that's the path the client wants to standardize on; it is not applied as part of the default deploy command in `k8s/README.md`.

`httproute.yaml` routes traffic to the same `pacman-app` `Service` (still `LoadBalancer`; `HTTPRoute` only adds a second way in, it doesn't replace the first). It needs two values substituted via `envsubst`, same as the rest of `k8s/`:

- `GATEWAY_NAME` / `GATEWAY_NAMESPACE`: the `Gateway` resource in the target cluster. Find it with `kubectl get gateway -A`.

To apply it manually once you have those values:

```bash
GATEWAY_NAME=... GATEWAY_NAMESPACE=... envsubst < k8s/gateway-api/httproute.yaml | kubectl apply -f -
```

In the local `kind_cluster --name app --expose-mode gateway-api` environment, the `Gateway` is named `app-gw` in the `default` namespace (confirmed with `kubectl get gateway -A` against that cluster), so locally: `GATEWAY_NAME=app-gw GATEWAY_NAMESPACE=default`.

**Not verified against the real client environment.** Whether the client's Terraform `kubernetes` module provisions an equivalent `Gateway` in the real VCFA-provisioned cluster has not been checked; confirm that (and its actual name/namespace) before relying on this manifest outside the local test environment.
