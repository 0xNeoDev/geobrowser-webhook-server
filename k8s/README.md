# Deploying to DOKS

The app server runs on the shared Geo DOKS cluster (same infra as gaia and
`geo-chat-api`), in the **`geo-notifications`** namespace. It's a containerized
Bun HTTP service behind an nginx ingress, backed by the shared managed Postgres
(`app-db`, formerly `chat-db`).

Manifests: `namespace.yaml`, `deployment.yaml`, `service.yaml`, `ingress.yaml`,
`secret.example.yaml` (template).

## First-time setup (manual, once)

1. **Namespace**
   ```sh
   kubectl apply -f k8s/namespace.yaml
   ```
   The `geo` image-pull secret is provisioned automatically in every namespace by
   the DOKS↔DOCR registry integration — no manual copy needed.

2. **Database** — create this app's database + role on the shared managed Postgres
   (`app-db`). Keep it isolated from other apps' data:
   ```sql
   CREATE DATABASE geobrowser_notifications;
   CREATE ROLE gbns LOGIN PASSWORD '...';
   GRANT ALL PRIVILEGES ON DATABASE geobrowser_notifications TO gbns;
   ```
   Migrations run automatically on deploy (the `migrate` initContainer).

3. **Secret** — copy the template, fill real values, and apply (never commit it):
   ```sh
   cp k8s/secret.example.yaml /tmp/secret.yaml   # edit /tmp/secret.yaml
   kubectl apply -f /tmp/secret.yaml && rm /tmp/secret.yaml
   ```
   Required: `DATABASE_URL` (app-db), `GEO_WEBHOOK_SECRET`, `PRIVY_APP_ID`,
   `PRIVY_APP_SECRET`. Optional: `MAILERSEND_API_KEY` + `MAILERSEND_FROM_EMAIL`
   (omit to run in-app only), `EMAIL_MAX_PER_RECIPIENT_PER_HOUR`.

4. **Register the webhook in gaia** — insert this app's row into gaia's
   `app_webhooks` table so the delivery-worker starts POSTing to us. The `secret`
   must equal `GEO_WEBHOOK_SECRET` above:
   ```sql
   INSERT INTO app_webhooks (app_name, url, secret)
   VALUES ('geobrowser', 'https://notifications-api.geobrowser.io/webhooks/geo', '<GEO_WEBHOOK_SECRET>');
   ```

5. **DNS** — point `notifications-api.geobrowser.io` at the nginx ingress
   LoadBalancer IP (same as `chat-api.geobrowser.io`). cert-manager
   (`letsencrypt-prod`) then issues the TLS cert automatically.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml` (build → push to DOCR →
`kubectl apply` → rollout). To apply manually:
```sh
kubectl apply -f k8s/   # namespace, deployment, service, ingress
kubectl rollout status deployment/geobrowser-webhook-server -n geo-notifications
```

## Notes
- Stateless HTTP service (2 replicas); the email hourly cap is DB-backed, so
  multiple replicas are safe.
- Liveness/readiness both hit `GET /health`.
- Repo secrets needed by the deploy workflow: `DIGITALOCEAN_ACCESS_TOKEN`,
  `DIGITALOCEAN_CLUSTER_NAME` (same ones gaia uses).
