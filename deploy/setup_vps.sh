#!/bin/bash
# SpatialScribe VPS Setup Script
# Run on fresh Ubuntu 22.04 OVHcloud VPS
# Run as root: bash setup_vps.sh

# Step 1 — Update system
# apt update && apt upgrade -y

# Step 2 — Install dependencies
# apt install -y python3-pip python3-venv postgresql postgresql-contrib nginx certbot python3-certbot-nginx git

# Step 3 — Create PostgreSQL database
# sudo -u postgres psql -c "CREATE DATABASE spatialscribe;"
# sudo -u postgres psql -c "CREATE USER spatialscribe WITH PASSWORD 'yourpassword';"
# sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE spatialscribe TO spatialscribe;"

# Step 4 — Clone repo and setup Python env
# git clone https://github.com/Bamshad-gh/Personal-Second-Brain-Assistant /var/www/spatialscribe
# cd /var/www/spatialscribe
# python3 -m venv venv
# source venv/bin/activate
# pip install -r requirements.txt

# Step 5 — Environment variables
# cp .env.production.example .env
# nano .env   <- fill in all values before continuing

# Step 6 — Django setup
# export $(cat .env | xargs)
# python manage.py migrate
# python manage.py collectstatic --no-input
# python manage.py createsuperuser

# Step 7 — Create log directory
# mkdir -p /var/log/spatialscribe
# chown www-data:www-data /var/log/spatialscribe

# Step 8 — Gunicorn systemd service
# cp deploy/spatialscribe.service /etc/systemd/system/spatialscribe.service
# systemctl daemon-reload
# systemctl enable spatialscribe
# systemctl start spatialscribe
# systemctl status spatialscribe   <- verify it's running

# Step 9 — Nginx config
# cp deploy/nginx.conf /etc/nginx/sites-available/spatialscribe
# ln -s /etc/nginx/sites-available/spatialscribe /etc/nginx/sites-enabled/
# nginx -t   <- test config
# systemctl restart nginx

# Step 10 — SSL certificate (after DNS A record points to this VPS)
# certbot --nginx -d api.spatialscribe.com

# Step 11 — Verify deployment
# curl https://api.spatialscribe.com/api/auth/login/   <- should return 405 or 400, not 5xx

echo "Setup complete. See deploy/ folder for service and nginx configs."
