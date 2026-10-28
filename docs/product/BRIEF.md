# KaryaHub: Product brief

> Summary of the approved Business Brief. Full brief: https://claude.ai/artifact/5mTrLnxr7tM48yVfN2P7aR
> Idea Document: https://claude.ai/artifact/5TTfMXNFvTMqxgs2dAoa42

**Verdict:** GO for the demo prototype (70/100), approved for build on 2026-10-28

## The problem
Traditional Indian service businesses, such as AC/HVAC, RO purifier and fire-safety firms that sell annual maintenance contracts (AMCs), run on WhatsApp and phone calls. Technicians send voice notes and photos of paper job sheets; someone re-types them, or nobody does. AMC renewals lapse because no one tracks expiry dates, and the owner has no view of field work. A lapsed AMC is revenue the owner can count.

## Who it is for, and who pays
- **Who pays:** the owner of an AC/HVAC, RO purifier or fire-safety service firm with 3 to 25 technicians.
- **Users:** the owner (or office manager) reviews jobs and sends reminders; technicians only send WhatsApp messages.
- **Value in their words:** "I know which AMCs expire this month and nothing slips because Ramesh was on leave."

## Why this, why now
97% of surveyed MSMEs use WhatsApp or WhatsApp Business ([PayNearby MSME Digital Index, via Entrepreneur India](https://india.entrepreneur.com/news-and-trends/whatsapp-and-whatsapp-business-dominate-msme-landscape-with/476232)), and India's air-conditioning market was about USD 7.07 billion in 2026, growing about 15% a year ([IMARC](https://www.imarcgroup.com/india-air-conditioning-market)). Speech-to-text for Indian languages and LLM extraction are now cheap enough that a technician's voice note can be the data entry.

## Competition and our edge
| Alternative | Price | Strength | Gap |
|---|---|---|---|
| Paper + WhatsApp groups + Excel | Free (plus clerk time) | Zero change for staff | No reminders, no history |
| Local AMC software ([IndiaMART listings](https://m.indiamart.com/impcat/amc-software.html)) | Mostly ₹2,500 to ₹25,000 one-time | Cheap, local support | Dashboard data entry; WhatsApp only as a contact button |
| [Zoho FSM](https://www.capterra.in/software/1056173/zoho-fsm) | Free tier; paid from about $30 | Full field-service suite | Heavy setup, app-first |
| [Vyapar](https://pricingsaas.com/companies/vyapar) | About $100 to $140 a year | GST billing owners already know | Billing, not AMC tracking or job capture |
| [Jio Haptik WhatsApp AI agents](https://getcoai.com/news/jio-haptik-launches-whatsapp-ai-agents-for-smbs-starting-at-rs-10k) | From ₹10,000 | Brand, distribution | Customer-facing chat, not back-office jobs |

**Edge:** the only tool where the technician's WhatsApp note is the data entry and the output is a renewal pipeline with money at stake.

## Revenue model
Setup fee of ₹15,000 to ₹25,000 plus a monthly retainer of ₹5,000 to ₹12,000 (founder's figures), priced against recovered renewals rather than against software. A cheaper self-serve tier (estimate ₹1,500 to ₹2,500 a month) may be needed. Running cost at pilot scale is roughly ₹250 per firm per month (estimate), so gross margin stays above 90%. Founder's target: 10 firms = ₹50,000 to ₹1.2 lakh a month, plausible only after a paid pilot proves renewal recovery.

## Success metrics (first 30 days)
- Pilot firms active: 3 or more using it weekly.
- Jobs logged per firm per week: 20 or more.
- Extraction accuracy: 85%+ of fields correct before edits.
- Renewal reminders sent: 50+ per firm; renewals recovered and their ₹ value.
- Pilot-to-paid conversion: at least 1 of 3 firms agrees to pay.

For the demo itself: show it to 10 owners and ask each for a paid 30-day pilot.

## What the real version needs
Accounts, services and keys required beyond the MVP, with costs:

| Service | Account and key needed | Cost | Notes |
|---|---|---|---|
| WhatsApp Business Platform (Cloud API) | Meta Business portfolio, business verification, a dedicated phone number, permanent access token, webhook verify token | No setup fee; utility messages about ₹0.11 to ₹0.16, marketing about ₹0.78 to ₹0.88; replies free within 24 h ([Robylon](https://www.robylon.ai/blog/whatsapp-business-api-pricing-india)) | Verification needs business documents; a reseller dashboard adds an estimated ₹1,000 to ₹3,000 a month |
| Speech-to-text | [Sarvam AI](https://docs.sarvam.ai/api/getting-started/pricing) API key (Indian languages) or an OpenAI API key | Sarvam ₹0.49 a minute with ₹100 free credit; OpenAI about $0.003 a minute | Sarvam is built for Hindi and regional languages |
| LLM for extraction and photo reading | Anthropic API key or Sarvam LLM key | Claude Haiku about $0.10 input / $0.50 output per million tokens | Reading job-sheet photos needs a vision-capable model |
| Hosting and database | Vercel (commercial use needs a paid plan) and a hosted database such as Supabase | Estimate: Vercel Pro about $20 a month; database free tier first | Needed for the webhook and multi-firm data |
| GST invoicing | The client firm's own GSTIN | Free | E-invoicing applies only above ₹5 crore turnover ([Tally](https://tallysolutions.com/business-guides/what-changed-in-e-invoicing-compliance-in-2026/)) |

## Risks and compliance flags
1. **Willingness to pay monthly.** Owners compare with one-time software. Mitigation: a paid pilot priced on renewals recovered.
2. **Personal data (flag for professional review).** Customer names, phones and addresses fall under the DPDP Act, with duties phasing in under the DPDP Rules 2025 ([Grant Thornton](https://www.grantthornton.in/insights/articles/dpdp-act-businesses-should-prepare-now-for-phased-obligations/)). The demo uses dummy data only and keeps everything in the browser.
3. **GST invoicing (flag for professional review).** Tax invoices have legal format rules. The demo marks every document "DEMO, not a valid tax invoice".
4. **Extraction errors.** Wrong amounts or dates hurt trust. The owner approves every record.
5. **WhatsApp platform rules.** Reminder templates may be priced as marketing, and Meta can change terms.
