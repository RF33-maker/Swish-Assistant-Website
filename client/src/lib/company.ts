/**
 * Who operates the site. These are the details UK law requires on a company
 * website (name, number, registered office, place of registration) and the ones
 * Meta checks when verifying the business, so they must match Companies House.
 */
export const COMPANY = {
  tradingName: "Swish Assistant",
  legalName: "Automated Athlete Ltd",
  number: "17534444",
  registeredIn: "England and Wales",
  address: "13 Redshank Way, Gloucester, England, GL2 4DZ",
  email: "admin@swishassistant.com",
} as const;
