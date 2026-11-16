# Lodran — static cultural library served by Nginx
# Multi-stage-free, single-stage build: copy static assets into the official nginx image.

FROM nginx:1.27-alpine

LABEL org.opencontainers.image.title="Lodran"
LABEL org.opencontainers.image.description="A non-profit cultural library — static site served by Nginx"
LABEL org.opencontainers.image.source="."

# Copy our Nginx configuration over the default.
COPY nginx/nginx.conf /etc/nginx/nginx.conf

# Copy the static site into the Nginx document root.
COPY index.html library.html shelf.html gallery.html about.html reader.html article.html search.html timeline.html 404.html /usr/share/nginx/html/
COPY sw.js manifest.webmanifest /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/  /usr/share/nginx/html/js/
COPY data/ /usr/share/nginx/html/data/
COPY assets/ /usr/share/nginx/html/assets/

# Ensure Nginx can read everything (nginx user needs read perms).
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx /var/log/nginx /var/run && \
    touch /var/run/nginx.pid && chown nginx:nginx /var/run/nginx.pid

# Expose HTTP
EXPOSE 80

# Lightweight healthcheck: confirm Nginx is responding on port 80.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/ >/dev/null 2>&1 || exit 1

# Drop privileges (nginx user) before starting the daemon.
USER nginx

CMD ["nginx", "-g", "daemon off;"]
