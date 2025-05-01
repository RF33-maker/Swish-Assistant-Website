import { Link } from "wouter";

export default function Footer() {
  return (
    <footer className="bg-white border-t border-neutral-200 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center">
        <div className="mb-4 md:mb-0">
          <p className="text-neutral-500 text-sm">&copy; {new Date().getFullYear()} Design Platform. All rights reserved.</p>
        </div>
        <div className="flex space-x-6">
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
