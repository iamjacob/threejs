'use client';
import Image from "next/image";
import { usePathname } from 'next/navigation';
import Link from "next/link";

function MenuLogo() {
  const path = usePathname() || '/';
  const isHome = path === '/';

  return (       
       
       <Link href="/" className="flex items-center">
          {/* ANIMATION CONTAINER
            Mobile: stays w-7 (28px) because we only show the icon.
            Desktop: slides between 28px and 120px.
          */}
          <div 
            className={`relative flex items-center transition-[width] duration-500 ease-in-out overflow-hidden h-8 ${
              isHome ? "w-6 md:w-[90px]" : "w-6"
            }`}
          >
            {/* 1. THE ICON: Always visible on Mobile. On Desktop, it's visible when NOT home. */}
            <div className={`absolute left-0 transition-opacity duration-500 ${
              !isHome ? "opacity-100" : "opacity-100 md:opacity-0"
            }`}>
              <Image
                src="/icons/logo.svg"
                alt="Logo"
                width={22}
                height={22}
                className="min-w-[22px] h-5.5"
                priority
              />
            </div>

            {/* 2. THE WORDMARK: Only visible on Desktop + Home */}
            <div className={`hidden md:block transition-opacity duration-500 ${
              isHome ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}>
              <Image
                src="/icons/wordmark-gradient.svg"
                alt="Logo Text"
                width={90}
                height={22}
                className="min-w-[90px] h-auto"
                priority
              />
            </div>
          </div>
        </Link>
    );
}

export default MenuLogo;