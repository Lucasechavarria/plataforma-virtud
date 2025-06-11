"use client";
import { User } from "firebase/auth";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "react-hot-toast";

interface NavbarProps {
  user?: User | null;
  showLogin?: boolean;
}

export default function Navbar({ user, showLogin = true }: NavbarProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const { logout } = await import("@/lib/firebase/auth");
      const { success, error } = await logout();
      
      if (success) {
        toast.success("Sesión cerrada correctamente");
        // Usar replace para evitar volver atrás a la sesión
        router.replace("/login");
      } else {
        toast.error(error || "Error al cerrar sesión");
      }
    } catch (error) {
      toast.error("Ocurrió un error inesperado");
      console.error("Logout error:", error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="sticky top-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md z-50 border-b border-gray-200 dark:border-gray-700 transition-colors duration-300">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-2" aria-label="Inicio">
          <Image
            src="/logo.webp"
            alt="Logo VIRTUD"
            width={40}
            height={40}
            className="h-10 w-auto"
            priority
          />
          <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
            VIRTUD
          </span>
        </Link>

        <nav className="flex items-center gap-4">
          {user ? (
            <>
              <div className="hidden md:flex items-center gap-2">
                <span className="text-gray-700 dark:text-gray-300 truncate max-w-[120px]">
                  {user.displayName || user.email?.split('@')[0]}
                </span>
                {user.photoURL && (
                  <Image
                    src={user.photoURL}
                    alt="Foto de perfil"
                    width={32}
                    height={32}
                    className="rounded-full"
                    referrerPolicy="no-referrer"
                  />
                )}
              </div>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                aria-label="Cerrar sesión"
                className={`px-4 py-2 rounded-md transition-colors ${
                  isLoggingOut
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-red-500 hover:bg-red-600 text-white"
                }`}
              >
                {isLoggingOut ? "Saliendo..." : "Cerrar sesión"}
              </button>
            </>
          ) : showLogin && pathname !== '/login' && (
            <Link
              href="/login"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              aria-label="Iniciar sesión"
            >
              Iniciar Sesión
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}