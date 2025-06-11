import { NextResponse } from 'next/server';
import { auth } from '@/lib/firebase/config'; // Corregida la ruta de importación

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg$).*)']
};

export async function middleware(request: Request) {
  const pathname = new URL(request.url).pathname;
  const publicPaths = ['/login', '/register', '/', '/error', '/forgot-password'];
  
  try {
    // En Next.js middleware, no podemos usar auth.currentUser directamente
    // Necesitamos verificar el token en las cookies
    const sessionToken = request.cookies.get('session')?.value;
    
    // Si no hay token y la ruta es privada, redirigir a login
    if (!sessionToken && !publicPaths.includes(pathname)) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    
    // Si hay token y está en ruta de autenticación, redirigir a dashboard
    if (sessionToken && (pathname === '/login' || pathname === '/register' || pathname === '/')) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    
    return NextResponse.next();
  } catch (error) {
    console.error('Middleware error:', error);
    return NextResponse.redirect(new URL('/error', request.url));
  }
}