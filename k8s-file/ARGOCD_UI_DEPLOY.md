# Argo CD UI Deploy (Step-by-Step, Simple)

Use this exactly. Copy and paste values from here.

## 0) What You Need

- Repo: `https://github.com/Arealis-network/Arealis-Zord.git`
- Branch: `prod`
- Best path (one app): `k8s-file/argocd/children`

## 1) Start Kubernetes on EC2

Run on EC2:

```bash
minikube start --driver=docker --cpus=4 --memory=8192
minikube addons enable ingress
```

If using LoadBalancer services, keep this running in another terminal:

```bash
minikube tunnel
```

## 2) Install Argo CD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl get pods -n argocd
```

Wait until all pods are `Running`.

## 3) Open Argo CD UI

On EC2:

```bash
kubectl port-forward svc/argocd-server -n argocd 8081:443 --address 127.0.0.1
```

On your laptop:

```bash
ssh -i <your-key>.pem -L 8081:127.0.0.1:8081 ec2-user@<EC2_PUBLIC_IP>
```

Open browser: `https://localhost:8081`

Get Argo password:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d; echo
```

Login:
- Username: `admin`
- Password: command output

## 4) Create Namespace Manually (Yes, do this)

```bash
kubectl create namespace arealis-zord
```

If it already exists, ignore the message.

## 5) Apply Secrets First (Important)

Edit files first:
- `k8s-file/kubernetes/secrets/zord-secrets.yaml`
- `k8s-file/kubernetes/secrets/edge-signing-key.yaml`

Then apply:

```bash
kubectl apply -k k8s-file/kubernetes/secrets
kubectl get secret -n arealis-zord
```

## 6) Create App in Argo CD UI (One App, Recommended)

In Argo CD UI:

1. Click `NEW APP`
2. Fill exactly:
- Application Name: `arealis-zord-root`
- Project Name: `default`
- Sync Policy: `Automatic`
- Repository URL: `https://github.com/Arealis-network/Arealis-Zord.git`
- Revision: `prod`
- Path: `k8s-file/argocd/children`
- Cluster URL: `https://kubernetes.default.svc`
- Namespace: `argocd`
3. Click `CREATE`
4. Click `SYNC`

This creates:
- `arealis-zord` app (platform only)

Note:
- Secrets are managed manually in Step 5 (not from Git).

## 7) Check Deployment

```bash
kubectl get applications -n argocd
kubectl get pods -n arealis-zord
kubectl get svc -n arealis-zord
kubectl get ingress -n arealis-zord
```

## 8) Open Your URLs

See all URLs here:
- `k8s-file/link.md`

Main frontend service is on port `80`:
- `zord-console` Service: `80 -> 3000`

## 9) If Something Fails

```bash
kubectl describe application arealis-zord-root -n argocd
kubectl describe application arealis-zord -n argocd
kubectl get events -n arealis-zord --sort-by=.lastTimestamp
kubectl logs -n arealis-zord <pod-name> --tail=200
```

---

## Optional: Create Apps Separately (Manual 2-App Method)

If you do not want root app, create app(s) separately in UI:

1. Platform app path: `k8s-file/kubernetes/argocd-full`
2. (Optional) Secrets app path: `k8s-file/kubernetes/secrets` only if your real secrets are committed to Git.

Recommended:
- Keep secrets local and apply them manually (Step 5).
- Use Argo CD only for platform app.
