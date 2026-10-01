import type { ReactNode } from "react";
import { Link } from "wouter";
import { Instagram } from "lucide-react";
import SwishLogo from "@/assets/Swish Assistant Logo.png";
import { useNavLeagues } from "@/lib/navLeagues";

const PLATFORM_INSTAGRAM_HANDLE = "swishassistant";

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45 mb-4">{title}</h4>
      <ul className="space-y-2.5 text-sm">{children}</ul>
    </div>
  );
}

const linkClass = "text-white/70 hover:text-white transition-colors";

/**
 * Homepage footer, doubling as a site map: explore, leagues (the same list
 * as the site nav, so it stays current), company and legal.
 */
export default function HomeFooter() {
  const { data: leagues = [] } = useNavLeagues();

  return (
    <footer className="relative bg-[#07080a] text-white overflow-hidden">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-500/70 to-transparent" />
      <div className="max-w-7xl mx-auto px-5 md:px-8 pt-14 md:pt-16 pb-8">
        <div className="grid grid-cols-2 md:grid-cols-12 gap-10">
          <div className="col-span-2 md:col-span-4">
            <div className="flex items-center gap-3">
              <img src={SwishLogo} alt="Swish Logo" className="h-9" />
              <span className="font-semibold text-lg">Swish Assistant</span>
            </div>
            <p className="mt-4 text-sm text-white/60 max-w-xs leading-relaxed">
              Redefining how we see basketball stats. Our sport, your leagues, your players, your stats — all just a few clicks away.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <a href={`https://www.instagram.com/${PLATFORM_INSTAGRAM_HANDLE}`} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="h-9 w-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                <Instagram className="h-4 w-4" />
              </a>
              <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="h-9 w-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
              <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)" className="h-9 w-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                </svg>
              </a>
              <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="h-9 w-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </a>
            </div>
          </div>

          <div className="md:col-span-2">
            <FooterColumn title="Explore">
              <li><Link href="/scores" className={linkClass}>Live scores</Link></li>
              <li><Link href="/teams" className={linkClass}>Teams</Link></li>
              <li><a href="/news" className={linkClass}>Latest News</a></li>
            </FooterColumn>
          </div>

          <div className="md:col-span-2">
            <FooterColumn title="Leagues">
              {leagues.slice(0, 6).map((l) => (
                <li key={l.key}><Link href={l.href} className={linkClass}>{l.label}</Link></li>
              ))}
            </FooterColumn>
          </div>

          <div className="md:col-span-2">
            <FooterColumn title="Company">
              <li><Link href="/coaches-hub" className={linkClass}>Coaches Hub</Link></li>
              <li><Link href="/contact-sales" className={linkClass}>Contact us</Link></li>
              <li><a href="#subscribe" className={linkClass}>Subscribe</a></li>
              <li><a href="#support" className={linkClass}>Support</a></li>
            </FooterColumn>
          </div>

          <div className="md:col-span-2">
            <FooterColumn title="Legal">
              <li><a href="/privacy" className={linkClass}>Privacy Policy</a></li>
              <li><a href="/terms" className={linkClass}>Terms of Service</a></li>
              <li><a href="/cookies" className={linkClass}>Cookie Policy</a></li>
            </FooterColumn>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/45">
          <p>&copy; {new Date().getFullYear()} Swish Assistant. All rights reserved.</p>
          <p>Made for British basketball.</p>
        </div>
      </div>
    </footer>
  );
}
