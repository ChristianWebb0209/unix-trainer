# Use the base Alpine image
FROM alpine:latest

# Install all the tools once at build time
RUN apk add --no-cache \
    bash \
    gawk \
    coreutils
# Create working directory
WORKDIR /app

# Keep container running
CMD ["tail", "-f", "/dev/null"]