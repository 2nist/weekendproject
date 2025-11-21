import * as React from 'react';

import { cn } from '../../lib/utils';

const Button = React.forwardRef(
  ({ className, variant = 'default', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus:outline-none',
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export { Button };
export default Button;
