import * as React from "react";
import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  immediate?: boolean;
}

const Skeleton = React.forwardRef<
  HTMLDivElement,
  SkeletonProps
>(({ className, immediate = false, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-md bg-muted",
        immediate ? "animate-pulse" : "skeleton-delayed",
        className,
      )}
      {...props}
    />
  );
});
Skeleton.displayName = "Skeleton";

export { Skeleton };
