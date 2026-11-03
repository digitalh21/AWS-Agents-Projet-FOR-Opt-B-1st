"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import type { HTMLAttributes, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useFeatureFlags } from "@/components/shared/feature-flags";

type Props = Omit<HTMLAttributes<HTMLElement>, "onClick"> & {
  href: string;
  children?: ReactNode;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
  /** open in a new tab (external URLs always do) */
  target?: string;
  rel?: string;
};

const EXTERNAL = /^(https?:|mailto:|tel:|\/\/)/i;

/**
 * <SecureLink> — a link that never exposes its destination.
 *
 * A normal <a href> shows the target URL in the browser status bar on hover.
 * When the admin enables "Secure Links", this renders a `role="link"` element
 * with NO href and navigates with `router.push()` (internal) or
 * `window.open(..., "noopener")` (external). When disabled it falls back to a
 * regular Next <Link>.
 *
 * NOTE: this hides the URL from casual hover only; it is not access control.
 */
export function SecureLink({
  href,
  children,
  onClick,
  prefetch,
  replace,
  scroll,
  target,
  rel,
  className,
  ...rest
}: Props) {
  const { flags } = useFeatureFlags();
  const router = useRouter();
  const external = EXTERNAL.test(href);

  if (!flags.secureLinks) {
    if (external) {
      return (
        <a
          href={href}
          target={target ?? "_blank"}
          rel={rel ?? "noopener noreferrer"}
          className={className}
          onClick={onClick}
          {...rest}
        >
          {children}
        </a>
      );
    }
    return (
      <NextLink
        href={href}
        prefetch={prefetch}
        replace={replace}
        scroll={scroll}
        className={className}
        onClick={onClick}
        {...rest}
      >
        {children}
      </NextLink>
    );
  }

  const go = () => {
    if (/^(tel:|mailto:)/i.test(href)) {
      window.location.href = href;
    } else if (external) {
      window.open(href, target ?? "_blank", "noopener,noreferrer");
    } else if (replace) {
      router.replace(href, { scroll });
    } else {
      router.push(href, { scroll });
    }
  };

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    go();
  };

  const handleKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      go();
    }
  };

  const warm = () => {
    if (!external && prefetch !== false) router.prefetch(href);
  };

  return (
    <span
      role="link"
      tabIndex={0}
      className={`cursor-pointer ${className ?? ""}`}
      onClick={handleClick}
      onKeyDown={handleKey}
      onMouseEnter={warm}
      onFocus={warm}
      {...rest}
    >
      {children}
    </span>
  );
}
