"use client";
import Image from "next/image";
import Link from "next/link";

const PROJECT_NAME = "سامانه عضویت حزب مؤتلفه اسلامی";

export function Brand({
  href,
  subtitle,
  compact = false,
  hero = false,
}: {
  href?: string;
  subtitle?: string;
  compact?: boolean;
  hero?: boolean;
}) {
  const size = hero ? 112 : compact ? 44 : 56;
  const inner = (
    <>
      <span
        className={
          hero
            ? "brand-logo-wrap hero"
            : compact
              ? "brand-logo-wrap compact"
              : "brand-logo-wrap"
        }
      >
        <Image
          src="/logo.png"
          alt="حزب مؤتلفه اسلامی"
          width={size}
          height={size}
          className="brand-logo"
          priority
        />
      </span>
      <div>
        <strong>{PROJECT_NAME}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </div>
    </>
  );
  const className = hero ? "brand brand-hero" : "brand";
  if (href)
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  return <div className={className}>{inner}</div>;
}

export { PROJECT_NAME };
