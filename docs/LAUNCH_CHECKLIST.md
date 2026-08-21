# Pre-Launch Legal & Privacy Review Checklist

> **This is not legal advice.** Complete all items with a qualified UK data-protection / privacy
> legal adviser before opening registration to the public.

## Purpose
Task #276 implements the technical infrastructure for GDPR-ready member accounts. The following
items remain open for business/legal sign-off. Nothing on this list is a software task —
it is a policy, governance, and process review.

---

## 1. Legal basis review
- [ ] Confirm the lawful basis for each processing activity listed in the Privacy Policy (§3).
- [ ] Verify that "legitimate interests" claims have a documented Legitimate Interests Assessment (LIA).
- [ ] Confirm the basis for processing consent audit logs beyond the member's deletion request.

## 2. Retention periods
- [ ] Agree and document final retention periods for each data category in the Privacy Policy table (§6).
- [ ] Ensure a deletion / anonymisation schedule is in place to actually execute the agreed periods.

## 3. International transfers
- [ ] Confirm the transfer mechanism for data sent to Supabase (EU region — likely adequate).
- [ ] Confirm the transfer mechanism for data processed by OpenAI (US — SCCs or equivalent needed).
- [ ] Confirm the transfer mechanism for Vercel Analytics.
- [ ] Add the confirmed mechanisms to the Privacy Policy (§9).

## 4. Age of consent
- [ ] Confirm the appropriate minimum age for the jurisdiction(s) of intended users.
- [ ] Decide whether age verification or self-declaration is required.
- [ ] Update Terms §2 accordingly.

## 5. ICO registration
- [ ] Confirm whether Automated Athlete is registered with the ICO as a data controller.
- [ ] If not, register or confirm an exemption applies.

## 6. Cookie compliance (PECR)
- [ ] Confirm that Vercel Analytics does not set cookies without consent (current understanding: no persistent cookies in basic mode — verify).
- [ ] Confirm that Supabase auth tokens are strictly necessary (no consent required).
- [ ] Test the cookie banner to verify analytics scripts are blocked when only "Essential only" is chosen.
- [ ] Record consent preference choice; confirm it persists correctly.

## 7. Email communications
- [ ] Confirm transactional-email templates (verification, deletion confirmation, export ready) are legally reviewed.
- [ ] Confirm unsubscribe mechanism for marketing emails is functional end-to-end.
- [ ] Confirm that marketing emails are only sent to users with an active marketing consent record.

## 8. Deletion and export process
- [ ] Document and test the offline process that fulfils export requests (currently manual/admin).
- [ ] Document and test the offline process that executes scheduled deletions.
- [ ] Confirm the 30-day grace period is appropriate (some jurisdictions require faster action on explicit requests).

## 9. Data breach response
- [ ] Confirm a documented data breach response procedure exists.
- [ ] Confirm a route to notify the ICO within 72 hours of a breach (if required).

## 10. Policy publication and version control
- [ ] Remove "working draft" banners from Privacy Policy, Terms, and Cookie Policy only after legal review is complete.
- [ ] Update the "last updated" date on all three pages to the approved-and-published date.
- [ ] Store approved PDF copies of each policy version.
- [ ] Add a change-log or summary of what changed for members who accepted a previous version.

## 11. Accessibility
- [ ] Verify that the cookie banner, registration form, and account centre meet WCAG 2.1 AA.

## 12. Final sign-off
- [ ] Legal adviser sign-off obtained and documented.
- [ ] Product owner sign-off obtained.
- [ ] Date of sign-off recorded and "working draft" notices removed from all policy pages.
