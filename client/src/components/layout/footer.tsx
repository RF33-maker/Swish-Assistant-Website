import { Link } from "wouter";

export default function Footer() {
  return (
    <footer className="bg-white border-t border-neutral-200 py-6 md:py-8 px-4 md:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 md:gap-0">
        <div className="mb-2 md:mb-0">
          <p className="text-neutral-500 text-xs md:text-sm text-center md:text-left">&copy; {new Date().getFullYear()} Design Platform. All rights reserved.</p>
        </div>
        <div className="flex space-x-4 md:space-x-6">
          <Link href="#" className="text-neutral-500 hover:text-neutral-700">
            Help
          </Link>
          <Link href="#" className="text-neutral-500 hover:text-neutral-700">
            Privacy
          </Link>
          <Link href="#" className="text-neutral-500 hover:text-neutral-700">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
