# MCP Registry Deployment Guide

This guide covers different ways to deploy the MCP Registry service.

## Docker Deployment

### Quick Start with Docker

```bash
# Build the Docker image
docker build -t mcp-registry .

# Run the container
docker run -p 8080:8080 mcp-registry
```

The service will be available at http://localhost:8080

### Docker with Custom Configuration

```bash
# Run with environment variables
docker run -p 8080:8080 \
  -e PORT=8080 \
  -e HOST=0.0.0.0 \
  -e LOG_LEVEL=debug \
  mcp-registry
```

### Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  mcp-registry:
    build: .
    ports:
      - "8080:8080"
    environment:
      - PORT=8080
      - HOST=0.0.0.0
      - LOG_LEVEL=info
      - DB_TYPE=memory
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

Run with:
```bash
docker-compose up -d
```

## Local Development

### Prerequisites

- Go 1.21 or later
- Git

### Setup

```bash
# Clone the repository
git clone https://github.com/QuickDeployAI/MCP-Registry.git
cd MCP-Registry

# Install dependencies
go mod tidy

# Build the application
go build -o bin/server cmd/server/main.go

# Run the server
./bin/server
```

### Development with Hot Reload

For development, you can use `go run` for automatic recompilation:

```bash
go run cmd/server/main.go
```

## Production Deployment

### Environment Variables

Configure the service using these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `8080` | Server port |
| `LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |
| `DB_TYPE` | `memory` | Database type (memory, postgres) |
| `DATABASE_URL` | `""` | Database connection string (for postgres) |
| `AUTH_ENABLED` | `false` | Enable authentication |
| `JWT_SECRET` | `""` | JWT signing secret |
| `GITHUB_AUTH` | `false` | Enable GitHub OAuth |

### Systemd Service

Create a systemd service file `/etc/systemd/system/mcp-registry.service`:

```ini
[Unit]
Description=MCP Registry Server
After=network.target

[Service]
Type=simple
User=mcp-registry
WorkingDirectory=/opt/mcp-registry
ExecStart=/opt/mcp-registry/server
Restart=always
RestartSec=5

# Environment
Environment=PORT=8080
Environment=HOST=0.0.0.0
Environment=LOG_LEVEL=info

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/mcp-registry

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable mcp-registry
sudo systemctl start mcp-registry
```

### Reverse Proxy with Nginx

Create nginx configuration `/etc/nginx/sites-available/mcp-registry`:

```nginx
server {
    listen 80;
    server_name your-registry-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-registry-domain.com;

    # SSL configuration
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # Proxy to MCP Registry
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS headers (if needed)
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods 'GET, POST, PUT, DELETE, OPTIONS';
        add_header Access-Control-Allow-Headers 'Content-Type, Authorization';
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/mcp-registry /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Cloud Deployments

### Google Cloud Run

1. Build and push to Container Registry:
```bash
# Build for Cloud Run
docker build -t gcr.io/your-project/mcp-registry .

# Push to registry
docker push gcr.io/your-project/mcp-registry
```

2. Deploy to Cloud Run:
```bash
gcloud run deploy mcp-registry \
  --image gcr.io/your-project/mcp-registry \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080
```

### AWS ECS

Create a task definition with the Docker image and deploy to ECS.

### Kubernetes

Create deployment and service manifests:

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-registry
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mcp-registry
  template:
    metadata:
      labels:
        app: mcp-registry
    spec:
      containers:
      - name: mcp-registry
        image: mcp-registry:latest
        ports:
        - containerPort: 8080
        env:
        - name: PORT
          value: "8080"
        - name: LOG_LEVEL
          value: "info"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 30

---
apiVersion: v1
kind: Service
metadata:
  name: mcp-registry-service
spec:
  selector:
    app: mcp-registry
  ports:
  - port: 80
    targetPort: 8080
  type: LoadBalancer
```

Deploy with:
```bash
kubectl apply -f deployment.yaml
```

## Monitoring and Logging

### Health Checks

The service provides a health check endpoint at `/health`:

```bash
curl http://localhost:8080/health
```

### Logging

The service logs to stdout/stderr. Configure log level with `LOG_LEVEL` environment variable.

For structured logging in production, consider using a logging aggregation service like:
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Fluentd
- Grafana Loki

### Metrics

Currently the service doesn't expose metrics. Consider adding Prometheus metrics for production monitoring.

## Security Considerations

### HTTPS

Always use HTTPS in production. Configure TLS termination at:
- Load balancer level (recommended)
- Reverse proxy (nginx/Apache)
- Application level (requires code changes)

### Authentication

For production use, enable authentication:
```bash
export AUTH_ENABLED=true
export JWT_SECRET="your-secret-key"
export GITHUB_AUTH=true  # If using GitHub OAuth
```

### Network Security

- Use firewalls to restrict access
- Consider VPC/private networks for cloud deployments
- Implement rate limiting at proxy level

## Backup and Recovery

### Memory Storage

With memory storage, data is lost on restart. For production, implement persistent storage.

### Persistent Storage

When database support is added, implement regular backups:
- Automated database backups
- Point-in-time recovery
- Disaster recovery procedures

## Troubleshooting

### Common Issues

1. **Port already in use**: Change PORT environment variable
2. **Permission denied**: Check user permissions and file ownership
3. **Out of memory**: Increase container/system memory limits
4. **Connection refused**: Verify service is running and port is open

### Debug Mode

Enable debug logging:
```bash
export LOG_LEVEL=debug
```

### Container Logs

View Docker container logs:
```bash
docker logs mcp-registry
```

For more help, check the [API documentation](API.md) and [GitHub issues](https://github.com/QuickDeployAI/MCP-Registry/issues).