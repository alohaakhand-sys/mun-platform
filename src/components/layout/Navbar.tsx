"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Menu, Plus, Search, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Avatar as RealAvatar,
  AvatarFallback as RealAvatarFallback,
  AvatarImage as RealAvatarImage,
} from "@/components/ui/avatar";
import { Logo } from "@/components/brand/Logo";
import { FOOTER_GROUPS } from "./footerLinks";
import { announceEventsSearch } from "@/components/public/eventsSearch";

/**
 * The public header — glass, sticky, styled from the `.mun-chrome` token scope.
 *
 * Desktop: logo · search · Conferences · Articles | Create event · Log in · Sign up
 * (signed in: Create event · Dashboard · avatar). Below 1000px: logo · search icon ·
 * Sign up / avatar · burger, which opens a full-screen menu (search, nav, auth, footer
 * links). The auth branches and every link are unchanged from the previous header.
 */
export function Navbar() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const menuSearchRef = useRef<HTMLInputElement>(null);
  const focusMenuSearch = useRef(false);

  // Search hands off to the /events browser, which reads `?q=` on mount. Keeping the
  // filtering there means one implementation, and a shareable URL for the result.
  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/events?q=${encodeURIComponent(term)}` : "/events");
    // Already on /events: the page reads `?q=` only on mount, so tell it directly.
    if (pathname === "/events") announceEventsSearch(term);
    setOpen(false);
  };

  // Close the menu on navigation (derived during render, not in an effect).
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setOpen(false);
  }

  // "/" focuses search (unless the user is already typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const input = searchRef.current;
      if (!input || input.offsetParent === null) return; // hidden on phones
      e.preventDefault();
      input.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Menu open: lock page scroll, Escape closes, optionally focus the menu search.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (focusMenuSearch.current) {
      focusMenuSearch.current = false;
      menuSearchRef.current?.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const createHref = user ? "/dashboard/organizer/events" : "/signup";
  const close = () => setOpen(false);

  const avatar = user && (
    <Link className="mp-head-avatar" href="/dashboard/profile" onClick={close} aria-label="Your profile">
      <RealAvatar className="h-8 w-8">
        <RealAvatarImage src={profile?.photoURL || user.photoURL || ""} alt={user.displayName || "User"} />
        <RealAvatarFallback className="text-xs">
          {user.displayName?.charAt(0) || user.email?.charAt(0) || "U"}
        </RealAvatarFallback>
      </RealAvatar>
    </Link>
  );

  const searchField = (ref: React.RefObject<HTMLInputElement | null>, id: string, withKbd: boolean) => (
    <form className="mp-search" role="search" onSubmit={submitSearch}>
      <Search size={16} aria-hidden="true" />
      <label className="mp-skip" htmlFor={id}>
        Search conferences
      </label>
      <input
        ref={ref}
        id={id}
        type="search"
        placeholder="Search a conference, committee or city"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") (e.target as HTMLInputElement).blur();
        }}
      />
      {withKbd && (
        <kbd className="mp-kbd" aria-hidden="true">
          /
        </kbd>
      )}
    </form>
  );

  return (
    <header className="mun-chrome mp-head">
      <a className="mp-skip" href="#main">
        Skip to content
      </a>

      <div className="mp-shell mp-head-row">
        <Link className="mp-brand" href="/" aria-label="MUN Pilot home">
          <Logo height={28} title="" />
        </Link>

        {searchField(searchRef, "mp-q", true)}

        <nav className="mp-nav" aria-label="Main">
          <span className="mp-nav-links">
            <Link
              className="mp-nav-link"
              href="/events"
              aria-current={pathname?.startsWith("/events") ? "page" : undefined}
            >
              Conferences
            </Link>
            <Link
              className="mp-nav-link"
              href="/blogs"
              aria-current={pathname?.startsWith("/blogs") ? "page" : undefined}
            >
              Articles
            </Link>
          </span>
          <span className="mp-divider" aria-hidden="true" />
          <Link className="mp-btn mp-btn-sec mp-btn-sm" href={createHref}>
            <Plus size={15} aria-hidden="true" />
            Create event
          </Link>
          {user ? (
            <>
              <Link className="mp-btn mp-btn-ghost mp-btn-sm" href="/dashboard">
                Dashboard
              </Link>
              {avatar}
            </>
          ) : (
            <>
              <Link className="mp-btn mp-btn-ghost mp-btn-sm" href="/login">
                Log in
              </Link>
              <Link className="mp-btn mp-btn-solid mp-btn-sm" href="/signup">
                Sign up
              </Link>
            </>
          )}
        </nav>

        <div className="mp-head-phone">
          <button
            type="button"
            className="mp-icon-btn"
            aria-label="Search"
            onClick={() => {
              focusMenuSearch.current = true;
              setOpen(true);
            }}
          >
            <Search size={20} aria-hidden="true" />
          </button>
          {user ? (
            avatar
          ) : (
            <Link className="mp-btn mp-btn-solid mp-btn-sm" href="/signup">
              Sign up
            </Link>
          )}
          <button
            type="button"
            className="mp-icon-btn"
            aria-expanded={open}
            aria-controls="mp-menu"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Portalled: the header's backdrop-filter would otherwise become the containing
          block of this `position: fixed` panel and clip it to the header's box. */}
      {open && createPortal(
        <div className="mun-chrome mp-menu" id="mp-menu" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="mp-menu-head">
            <button type="button" className="mp-icon-btn" aria-label="Close menu" onClick={close}>
              <X size={20} aria-hidden="true" />
            </button>
            <b>Menu</b>
          </div>
          <div className="mp-menu-body">
            {searchField(menuSearchRef, "mp-q-menu", false)}
            <nav className="mp-menu-list" aria-label="Main">
              <Link href="/events" onClick={close}>
                Conferences
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
              <Link href="/blogs" onClick={close}>
                Articles
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
              <Link href={createHref} onClick={close}>
                Create event
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
              {user && (
                <Link href="/dashboard" onClick={close}>
                  Dashboard
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              )}
            </nav>
            {!user && (
              <div className="mp-menu-auth">
                <Link className="mp-btn mp-btn-sec" href="/login" onClick={close}>
                  Log in
                </Link>
                <Link className="mp-btn mp-btn-solid" href="/signup" onClick={close}>
                  Sign up
                </Link>
              </div>
            )}
            <div className="mp-menu-links">
              {FOOTER_GROUPS.map((group) => (
                <div key={group.title}>
                  <h3>{group.title}</h3>
                  <ul>
                    {group.links.map((link) => (
                      <li key={link.label}>
                        <Link href={link.href} onClick={close}>
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </header>
  );
}
