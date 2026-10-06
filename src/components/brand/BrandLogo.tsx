import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  /** Height in CSS pixels; width follows the wordmark aspect. */
  height?: number;
  priority?: boolean;
};

/** Official wordmark: /brand/logo.webp */
export function BrandLogo({
  className,
  height = 28,
  priority = false,
}: BrandLogoProps) {
  const width = Math.round(height * (640 / 199));
  return (
    <Image
      src="/brand/logo.webp"
      alt="Ghost Companion"
      width={640}
      height={199}
      priority={priority}
      className={cn("h-auto w-auto object-contain object-left", className)}
      style={{ height, width }}
    />
  );
}
