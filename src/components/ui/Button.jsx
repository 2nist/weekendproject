import React from 'react';

// Minimal shadcn-like Button wrapper. Accepts `variant` and `className`.
export default function Button({
  children,
  className = '',
  variant = 'default',
  ...props
}) {
  const base =
    'px-3 py-1 rounded-md text-sm inline-flex items-center justify-center';
  const variants = {
    default: 'bg-gray-100 text-gray-900',
    primary: 'bg-blue-600 text-white',
    success: 'bg-green-600 text-white',
    danger: 'bg-red-600 text-white',
  };

  const cls = `${base} ${variants[variant] ?? variants.default} ${className}`;

  return (
    <button className={cls} {...props}>
      {children}
    </button>
  );
}
