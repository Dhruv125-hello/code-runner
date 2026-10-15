# Security

This project runs code written by users, which is risky. Read this before hosting it publicly.

## What is already in place
- Each run uses a fresh Docker container that is deleted afterwards
- No network access, 1 CPU, limited memory, process limit, 5-minute time limit
- Read-only root file system, all Linux capabilities dropped, `no-new-privileges`
- Output size and program size are capped, and only 4 runs happen at once
- The WebSocket only accepts localhost and the origins listed in `ALLOWED_ORIGINS`

## Before a public deployment
- Add a stronger sandbox such as gVisor (plain Docker is not enough against a determined attacker)
- Add per-visitor rate limiting
- Run the backend directly on a Linux server, not inside a container with Docker access
- Use HTTPS, set `ALLOWED_ORIGINS` to your domain, and set up monitoring and spending alerts
- Never commit passwords, keys or `.env` files

## Reporting a problem
Please open a private security advisory on GitHub or email the maintainer. Do not post exploits publicly.
