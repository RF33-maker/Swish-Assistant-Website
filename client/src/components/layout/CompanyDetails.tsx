import { COMPANY } from "@/lib/company";

/** The trading-name and registration line shown in the footer and under the legal pages. */
export default function CompanyDetails({ className = "" }: { className?: string }) {
  return (
    <p className={className}>
      {COMPANY.tradingName} is a trading name of {COMPANY.legalName}, registered in {COMPANY.registeredIn},
      company number {COMPANY.number}. Registered office: {COMPANY.address}. Contact:{" "}
      <a href={`mailto:${COMPANY.email}`} className="underline underline-offset-2 hover:opacity-80">
        {COMPANY.email}
      </a>
      .
    </p>
  );
}
