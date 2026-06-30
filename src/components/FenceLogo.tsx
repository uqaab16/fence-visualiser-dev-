import React from 'react';

interface FenceLogoProps {
  className?: string;
  color?: string;
}

export default function FenceLogo({ className = "w-12 h-12", color = "text-white" }: FenceLogoProps) {
  return (
    <svg 
      className={`${className} ${color}`}
      viewBox="0 0 100 100" 
      fill="currentColor"
    >
      {/* 
        A clean, custom vector graphic representing a high-contrast minimalist gate and fence section.
        Designed to scale beautifully in headers, dashboards, and portals.
      */}
      {/* Horizontal Rails */}
      <rect x="5" y="32" width="90" height="8" rx="2" />
      <rect x="5" y="68" width="90" height="8" rx="2" />
      
      {/* Slat 1 */}
      <path d="M 12,90 L 12,22 L 20,10 L 28,22 L 28,90 Z" />
      
      {/* Slat 2 */}
      <path d="M 42,90 L 42,22 L 50,10 L 58,22 L 58,90 Z" />
      
      {/* Slat 3 */}
      <path d="M 72,90 L 72,22 L 80,10 L 88,22 L 88,90 Z" />
    </svg>
  );
}
