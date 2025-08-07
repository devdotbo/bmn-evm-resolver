/**
 * Simple health check server for Docker health checks
 */

export function startHealthServer(port: number, serviceName: string) {
  const handler = (req: Request): Response => {
    const url = new URL(req.url);
    
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "healthy",
          service: serviceName,
          timestamp: new Date().toISOString(),
          uptime: Math.floor(performance.now() / 1000),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    
    if (url.pathname === "/metrics") {
      // Basic Prometheus metrics format
      const metrics = [
        `# HELP ${serviceName}_up Service is up`,
        `# TYPE ${serviceName}_up gauge`,
        `${serviceName}_up 1`,
        `# HELP ${serviceName}_uptime_seconds Service uptime in seconds`,
        `# TYPE ${serviceName}_uptime_seconds counter`,
        `${serviceName}_uptime_seconds ${Math.floor(performance.now() / 1000)}`,
      ].join("\n");
      
      return new Response(metrics, {
        status: 200,
        headers: { "Content-Type": "text/plain; version=0.0.4" },
      });
    }
    
    return new Response("Not Found", { status: 404 });
  };
  
  const server = Deno.serve({ port }, handler);
  
  console.log(`Health check server started on port ${port} for service: ${serviceName}`);
  
  return server;
}