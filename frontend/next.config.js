const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  // Añade esto:
  serverOptions: {
    host: '0.0.0.0' // Acepta conexiones de cualquier red
  }
}