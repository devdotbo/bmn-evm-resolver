FROM denoland/deno:latest

WORKDIR /app

# Copy dependency files first
COPY deno.json ./

# Copy application code
COPY . .

# Create directory for Deno KV storage
RUN mkdir -p /app/data

# Cache the main application file and dependencies
RUN deno cache resolver.ts

# Run the application
CMD ["deno", "task", "resolver"]