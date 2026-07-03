import type { FrameworkData } from './types.js';

export const NIST_CSF_FRAMEWORK: FrameworkData = {
  key: 'nist-csf',
  name: 'NIST Cybersecurity Framework 2.0',
  shortName: 'NIST-CSF',
  version: '2.0',
  description:
    'NIST Cybersecurity Framework 2.0 — outcome-based cybersecurity guidance organized into six functions: Govern, Identify, Protect, Detect, Respond, and Recover.',
  nistMappingEnabled: false,
  contentVersion: 1,
  metadata: {
    publisher: 'National Institute of Standards and Technology',
    effectiveDate: '2024-02-26',
  },
  areas: [
    {
      code: 'GV',
      title: 'Govern',
      description:
        'Establish, communicate, and monitor the organization cybersecurity risk management strategy, expectations, and policy.',
      controls: [
        {
          code: 'GV.OC-01',
          title: 'Mission Informs Risk Management',
          description:
            'Understand the organizational mission and use it to inform cybersecurity risk management decisions.',
          explanation:
            'The business needs to articulate what it does, what it cannot afford to lose, and how cybersecurity supports that mission. For an MSP this means capturing a short business profile during onboarding: core services, revenue-critical systems, and tolerable downtime. That profile should drive every later decision, from backup retention to which endpoints get EDR first. Verify by checking that a documented client profile exists in the platform and that it was reviewed within the last year.',
          example:
            'Client profile documented 2026-03-14 during QBR: dental practice, 2 locations, 34 endpoints; patient scheduling (Dentrix) and imaging identified as mission-critical with 4-hour RTO. Profile linked to risk register and reviewed annually.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.OC-02',
          title: 'Stakeholder Needs Understood',
          description:
            'Identify internal and external stakeholders and understand their cybersecurity expectations.',
          explanation:
            'Stakeholders include owners, employees, customers, regulators, insurers, and key partners, each with different expectations about security and privacy. The MSP should facilitate a short stakeholder mapping exercise with the client and record it alongside the governance documentation. Cyber insurance questionnaires and customer security addenda are practical inputs. Verify that a stakeholder list exists and that insurance and contractual security obligations are reflected in it.',
          example:
            'Stakeholder map completed 2026-01-22: owners, 41 staff, ~600 patients, state dental board, Travelers cyber policy (renewal 09/2026). Insurer MFA and EDR requirements recorded and cross-referenced to PR.AA-05 and DE.CM-09.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.OC-03',
          title: 'Legal and Regulatory Requirements Managed',
          description:
            'Understand and manage legal, regulatory, and contractual cybersecurity requirements, including privacy obligations.',
          explanation:
            'Most small businesses are subject to at least one obligation set: HIPAA, PCI DSS, state breach-notification laws, FTC Safeguards, or contractual clauses from larger customers. The MSP should maintain a documented list of applicable requirements per client and map them to installed compliance frameworks in this platform. This list also determines breach-notification timelines the IR plan must honor. Verify the requirements list exists, names each obligation, and was reviewed in the last 12 months.',
          example:
            'Compliance obligations register updated 2026-04-02: HIPAA Security Rule, NY SHIELD Act, PCI SAQ-B for front-desk terminal, cyber policy conditions. HIPAA framework installed in platform; SHIELD 72-hour internal escalation added to IR plan v2.3.',
          type: 'administrative',
          severity: 'high',
        },
        {
          code: 'GV.OC-04',
          title: 'Critical Services to Others Communicated',
          description:
            'Understand and communicate the critical objectives, capabilities, and services that external stakeholders depend on or expect from the organization.',
          explanation:
            'The client should know which of its outputs other parties depend on, such as customer-facing portals, order fulfillment, or data it processes for partners. Documenting these dependencies clarifies which systems deserve the strongest protection and fastest recovery targets. The MSP captures this in the business impact notes attached to the client record. Verify that outward-facing critical services are listed with owners and recovery expectations.',
          example:
            'Documented 2025-11-18: client hosts a customer order portal used by 3 wholesale partners; contractual 99.5% uptime expectation. Portal VM tagged critical, 1-hour RPO on BCDR appliance. Reviewed at January 2026 QBR.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.OC-05',
          title: 'Critical Dependencies Understood',
          description:
            'Understand and communicate the outcomes, capabilities, and services that the organization depends on.',
          explanation:
            'This is the inbound dependency view: SaaS platforms, ISPs, payment processors, line-of-business vendors, and the MSP itself. Each dependency should appear in the vendor list with a note on what breaks if it goes down. This feeds supply chain risk work under GV.SC and contingency planning. Verify the vendor module contains the critical dependencies with criticality ratings, not just billing contacts.',
          example:
            'Vendor module lists 14 dependencies; 5 rated critical (M365, Dentrix cloud, Spectrum fiber, payment processor, MSP). Single-ISP dependency flagged as risk RR-012 with LTE failover quoted 2026-02-10; client deferred to FY27 budget.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.RM-01',
          title: 'Risk Management Objectives Established',
          description:
            'Establish cybersecurity risk management objectives and obtain agreement from organizational stakeholders.',
          explanation:
            'The client leadership should agree on a handful of concrete security objectives rather than a vague goal to be secure. Typical SMB objectives: no ransomware-driven downtime beyond 8 hours, MFA on all remote access, annual risk review. The MSP drafts these during onboarding or a QBR and gets sign-off from an owner or executive. Verify signed or acknowledged objectives exist and are dated within the review cycle.',
          example:
            'Security objectives v1.2 acknowledged by managing partner 2026-02-05: (1) MFA on 100% of remote and email access, (2) restore critical systems within 8 business hours, (3) quarterly vulnerability review. Stored in policy module with acknowledgment record.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.RM-02',
          title: 'Risk Appetite and Tolerance Defined',
          description:
            'Establish, communicate, and maintain risk appetite and risk tolerance statements.',
          explanation:
            'Risk appetite states how much cyber risk leadership will accept in plain terms, and tolerance sets measurable bounds, such as maximum acceptable downtime or data loss. For SMB clients the MSP typically facilitates a one-page statement covering downtime, data loss, and spend thresholds. These figures then justify decisions like backup frequency and whether risks are accepted or remediated. Verify a dated statement exists and that accepted risks in the register reference it.',
          example:
            'Risk appetite statement signed 2025-10-30: max tolerable downtime 8 hours for practice management, 24 hours for file shares; RPO 1 hour; risks under $2,500 annualized may be accepted by office manager. Referenced by 3 accepted risks in register.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.RM-03',
          title: 'Cyber Risk in Enterprise Risk Management',
          description:
            'Include cybersecurity risk management activities and outcomes in enterprise risk management processes.',
          explanation:
            'Cyber risk should be discussed wherever the client discusses other business risks, such as leadership meetings or annual planning, rather than being siloed with IT. Practically, the MSP brings the risk register and open findings to QBRs attended by an owner or executive. Meeting notes and QBR decks are the evidence trail. Verify cyber risk appears in leadership-level meeting records at least twice a year.',
          example:
            'QBR decks for 2025-Q3, 2026-Q1 include risk register summary slide; owner present per attendance notes. 2026-Q1 meeting resulted in approval of $4,800 firewall refresh to close risk RR-007. Cadence meets twice-yearly target.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.RM-04',
          title: 'Risk Response Direction Communicated',
          description:
            'Establish and communicate strategic direction describing appropriate risk response options.',
          explanation:
            'Leadership should define which responses are on the table for cyber risks: mitigate, transfer via insurance, avoid, or accept, and who may choose each. The MSP documents this as a short section in the risk management policy, including who can formally accept a risk. This prevents risks from being silently accepted by nobody in particular. Verify the policy names response options and an approval authority, and that register entries record the chosen response.',
          example:
            'Risk management policy v2.0 (approved 2026-01-15) defines mitigate/transfer/avoid/accept with acceptance authority limited to the two owners. 11 of 11 open register entries have a recorded response decision; 2 accepted risks carry owner sign-off.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.RM-05',
          title: 'Risk Communication Lines Established',
          description:
            'Establish lines of communication across the organization for cybersecurity risks, including risks from suppliers and other third parties.',
          explanation:
            'Staff need to know how to report suspected security issues, and leadership needs a defined channel for hearing about new risks, including vendor incidents. The MSP typically sets up a report-phishing button, a documented escalation path to the service desk, and a standing risk agenda item at QBRs. Vendor breach notifications should route to the same channel. Verify the escalation path is documented in the policy set and staff-facing materials.',
          example:
            'Escalation path documented in Acceptable Use Policy v1.4 and onboarding one-pager: staff report to office manager or MSP hotline; Huntress SAT phish-report button deployed to all 34 mailboxes 2025-12-01. Vendor incident notifications route to shared security@ mailbox monitored by MSP.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.RM-06',
          title: 'Standardized Risk Scoring Method',
          description:
            'Establish and communicate a standardized method for calculating, documenting, categorizing, and prioritizing cybersecurity risks.',
          explanation:
            'Risks should be scored the same way every time, typically a likelihood-times-impact matrix, so priorities are defensible and comparable across quarters. The platform risk register provides the scoring fields; the MSP documents the scale definitions in the risk management policy. Consistency matters more than sophistication for SMB clients. Verify all register entries carry likelihood, impact, and a computed rating on the documented scale.',
          example:
            'Risk policy defines 1-5 likelihood x 1-5 impact matrix with thresholds (>=15 high, must be treated within 90 days). Register audit 2026-05-20: 11 of 11 entries scored on the matrix; however 2 entries created before policy adoption use legacy High/Med labels — partial, rescoring scheduled.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.RM-07',
          title: 'Strategic Opportunities Considered',
          description:
            'Characterize strategic opportunities (positive risks) and include them in organizational cybersecurity risk discussions.',
          explanation:
            'Not all risk discussion is defensive: strong security can win contracts, lower insurance premiums, or enable safe adoption of new technology. The MSP should note upside opportunities in QBR discussions, such as pursuing a security certification that a key customer requires. Recording these keeps the security program aligned with growth rather than framed purely as cost. Verify at least occasional opportunity entries or QBR notes exist alongside threat-focused risks.',
          example:
            'QBR 2026-04 notes: prospective wholesale customer requires vendor security questionnaire; completing CSF-aligned assessment identified as opportunity to win ~$200k/yr contract. Tracked as positive-risk entry OPP-002 with target date 2026-08.',
          type: 'administrative',
          severity: 'low',
        },
        {
          code: 'GV.RR-01',
          title: 'Leadership Accountable for Cyber Risk',
          description:
            'Ensure organizational leadership is responsible and accountable for cybersecurity risk and fosters a risk-aware, ethical, continually improving culture.',
          explanation:
            'An owner or executive, not the MSP, must formally own cyber risk; the MSP advises and operates but cannot accept risk on behalf of the client. Practically this means a named executive sponsor who signs policies, approves risk acceptances, and attends security reviews. Culture is evidenced by leadership completing the same security training as staff and funding agreed remediations. Verify a named accountable executive appears in the governance documentation and on policy approvals.',
          example:
            'Managing partner J. Alvarez designated accountable executive in governance charter signed 2025-09-12; has approved all 6 policies, attends QBRs, and completed 2026 SAT modules (finished 2026-03-08). Approved 3 of 4 recommended remediations; declined office camera upgrade with documented acceptance.',
          type: 'administrative',
          severity: 'high',
        },
        {
          code: 'GV.RR-02',
          title: 'Cybersecurity Roles Defined and Enforced',
          description:
            'Establish, communicate, understand, and enforce roles, responsibilities, and authorities related to cybersecurity risk management.',
          explanation:
            'Everyone should know who does what: which duties belong to the MSP, which to the client point of contact, and what every employee is responsible for. The MSP documents this in a responsibility matrix (often RACI-style) covering patching, backup checks, user onboarding/offboarding, incident declaration, and vendor management. Ambiguity here is a common root cause of missed offboarding and unpatched shadow IT. Verify the matrix exists, is current, and matches the actual service agreement.',
          example:
            'RACI matrix v3 published 2026-01-20 in policy module: MSP responsible for patching/EDR/backup, office manager responsible for same-day termination notices, owner accountable for risk acceptance. Gap noted: matrix does not yet cover the new VoIP vendor — update ticketed (T-88412).',
          type: 'administrative',
          severity: 'high',
        },
        {
          code: 'GV.RR-03',
          title: 'Adequate Resources Allocated',
          description:
            'Allocate resources commensurate with the cybersecurity risk strategy, roles, responsibilities, and policies.',
          explanation:
            'The security program needs sustained budget and staff time, not one-time purchases. The MSP should document the security stack and its coverage (EDR seats, backup capacity, SAT licenses) against the asset inventory, and raise gaps at budget time. Chronic underfunding shows up as unlicensed endpoints, expired subscriptions, or deferred hardware past end-of-life. Verify license counts match device and user counts and that the annual budget includes the agreed security line items.',
          example:
            'Coverage check 2026-06-01: 34 of 34 endpoints licensed for Huntress and RMM; 41 of 41 users on SAT and Duo. FY27 budget approved 2026-05 includes firewall refresh and BCDR capacity increase. No unlicensed assets found.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.RR-04',
          title: 'Cybersecurity in HR Practices',
          description:
            'Include cybersecurity in human resources practices such as onboarding, transfers, and offboarding.',
          explanation:
            'HR events drive account lifecycle: hires need provisioned least-privilege accounts and training, transfers need access adjusted, and departures need same-day deprovisioning. The MSP should have standardized onboarding/offboarding ticket templates tied to HR notification, plus background-check and confidentiality expectations documented in policy. The most common failure is HR not telling IT about a termination. Verify checklist tickets exist for recent HR events and offboarding turnaround meets the documented SLA.',
          example:
            'Sampled 4 HR events from 2026-Q1: 3 offboardings completed within 4 business hours of notice (tickets T-87210, T-87891, T-88003); 1 termination on 2026-02-13 was not reported to MSP for 6 days — account remained enabled. Non-compliant; HR notification process re-trained 2026-03-01.',
          type: 'administrative',
          severity: 'high',
        },
        {
          code: 'GV.PO-01',
          title: 'Cybersecurity Policy Established',
          description:
            'Establish, communicate, and enforce a cybersecurity risk management policy based on organizational context, strategy, and priorities.',
          explanation:
            'The client needs a written, approved policy set covering at minimum acceptable use, access control, data handling, incident response, and backup/recovery expectations. The MSP typically supplies templates from the platform policy module, tailors them with the client, and collects staff acknowledgments. Policies must reflect the actual environment, not aspirational boilerplate. Verify each core policy is approved by leadership, published to staff, and acknowledged by all active users.',
          example:
            'Policy module shows 6 core policies approved by owner 2026-01-15; acknowledgment campaign completed 2026-02-01 with 39 of 41 staff acknowledged (2 on leave, flagged for return-to-work). AUP content verified to match actual MFA and remote access setup.',
          type: 'administrative',
          severity: 'high',
        },
        {
          code: 'GV.PO-02',
          title: 'Policy Reviewed and Updated',
          description:
            'Review, update, communicate, and enforce the cybersecurity policy to reflect changes in requirements, threats, technology, and mission.',
          explanation:
            'Policies rot quickly: new SaaS tools, new regulations, or a change in remote-work practice can make last year policy wrong. The MSP should run an annual review cycle in the policy module with version history and re-acknowledgment when material changes occur. Trigger-based reviews (new regulation, major incident, new line-of-business app) supplement the annual pass. Verify each policy has a review date within 12 months and versioned change history.',
          example:
            'Annual review completed 2026-01-15: all 6 policies reviewed, 2 revised (remote access policy updated for new VPN; data handling updated for SHIELD Act). Version history in platform shows v1.x to v2.x diffs. Next review scheduled 2027-01 with calendar hold.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.OV-01',
          title: 'Strategy Outcomes Reviewed',
          description:
            'Review cybersecurity risk management strategy outcomes to inform and adjust strategy and direction.',
          explanation:
            'Leadership should periodically ask whether the security program achieved what it set out to do: were objectives met, incidents reduced, audits passed. The MSP presents outcome data at QBRs — compliance scores from this platform, incident counts, patch and backup success rates — and records resulting direction changes. Without this loop the program drifts into tool maintenance. Verify QBR records show outcome metrics reviewed and at least one documented strategy decision per year.',
          example:
            '2026-Q1 QBR reviewed: CSF assessment score up from 61% to 74%, zero security incidents in trailing 12 months, patch compliance 96%. Decision recorded: shift 2026 focus to supply chain controls (GV.SC) after vendor questionnaire gaps identified.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.OV-02',
          title: 'Strategy Coverage Reviewed',
          description:
            'Review and adjust the cybersecurity risk management strategy to ensure coverage of organizational requirements and risks.',
          explanation:
            'The strategy itself needs a periodic fit check: does it still cover the current environment, obligations, and threat landscape after business changes like a new location, acquisition, or cloud migration. The MSP re-runs the scoping questions annually and after major changes, updating the framework assessments and risk register accordingly. Verify the strategy or program document has an annual review record and reflects known business changes.',
          example:
            'Strategy reviewed 2026-02-20 following opening of second location: scope expanded to 12 new endpoints and site-to-site VPN; CSF assessment re-scoped and physical security controls added for the new suite. Review memo attached to governance folder.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.OV-03',
          title: 'Program Performance Evaluated',
          description:
            'Evaluate and review organizational cybersecurity risk management performance and adjust as needed.',
          explanation:
            'Beyond strategy, day-to-day performance should be measured: mean time to patch, backup success rate, phishing simulation failure rate, ticket SLA attainment on security requests. The MSP publishes these metrics on a recurring report and tracks trends, adjusting processes when metrics degrade. Verify a recurring performance report exists with at least 3-4 quantitative security metrics and evidence that misses triggered action.',
          example:
            'Monthly security report (May 2026): patch compliance 96.4%, backup success 99.1%, phish-sim click rate 7% (down from 18% in Nov 2025), 0 overdue critical vulns. April backup dip to 91% triggered agent reinstall on 2 servers — documented in ticket T-89102.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.SC-01',
          title: 'Supply Chain Risk Program Established',
          description:
            'Establish a cybersecurity supply chain risk management program, strategy, objectives, policies, and processes agreed to by stakeholders.',
          explanation:
            'The client needs a deliberate, written approach to vendor cyber risk rather than ad hoc trust. For SMBs this is typically a 2-3 page third-party risk policy defining how vendors are inventoried, rated, assessed, and reviewed, maintained in the platform policy and vendor modules. The MSP facilitates the policy and runs the process on the client behalf. Verify the policy exists, is leadership-approved, and matches how vendors are actually tracked.',
          example:
            'Third-party risk policy v1.0 approved by owner 2026-03-10; defines criticality tiers, questionnaire requirement for critical vendors, and annual review. Vendor module populated with 14 vendors. Process is new — first annual review cycle due 2027-03.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.SC-02',
          title: 'Supplier Security Roles Established',
          description:
            'Establish, communicate, and coordinate cybersecurity roles and responsibilities for suppliers, customers, and partners.',
          explanation:
            'For each significant third party it should be clear who secures what: who patches the hosted app, who manages user access, who is called during an incident. The MSP records these responsibility notes on each vendor record, including support contacts and incident notification commitments. This matters most for line-of-business SaaS vendors and any co-managed IT arrangement. Verify critical vendor records name a security contact and describe the responsibility split.',
          example:
            'All 5 critical vendor records include security contact and responsibility notes as of 2026-04-15; e.g. Dentrix cloud record: vendor patches application and hosts data, MSP manages user accounts, vendor commits to 72-hour breach notification per BAA. 3 non-critical vendors still missing contacts — in progress.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.SC-03',
          title: 'Supply Chain Risk Integrated into ERM',
          description:
            'Integrate cybersecurity supply chain risk management into overall cybersecurity and enterprise risk management, risk assessment, and improvement processes.',
          explanation:
            'Vendor risks belong in the same risk register and review meetings as everything else, scored on the same scale. When a vendor assessment or public breach reveals exposure, it should generate a register entry and, where warranted, a remediation or contract action. The MSP wires the vendor module output into the risk register and QBR agenda. Verify vendor-sourced risks appear in the register with the standard scoring and review cadence.',
          example:
            'Risk register contains 3 vendor-sourced entries (single-ISP dependency, payment processor lacking SOC 2, legacy imaging vendor EOL software), each scored on the standard 5x5 matrix and reviewed at 2026-Q1 QBR. Imaging vendor risk escalated to high; replacement evaluation started.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.SC-04',
          title: 'Suppliers Known and Prioritized',
          description:
            'Maintain knowledge of suppliers and prioritize them by criticality.',
          explanation:
            'You cannot manage vendor risk without a complete vendor list ranked by how badly their compromise or outage would hurt. The MSP builds the list in the vendor module from AP records, SSO app inventory, and interviews, then assigns criticality tiers based on data access and operational dependence. The list should be reconciled at least annually against new SaaS signups discovered via M365 enterprise app audits. Verify the vendor list is populated, tiered, and reconciled within 12 months.',
          example:
            'Vendor inventory reconciled 2026-05-08 against M365 enterprise applications and AP export: 14 vendors on record, 2 new SaaS tools discovered (e-signature and scheduling app) and added. Tiers: 5 critical, 4 moderate, 7 low. Next reconciliation 2027-05.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.SC-05',
          title: 'Security Requirements in Contracts',
          description:
            'Establish and prioritize requirements to address cybersecurity risks in supply chains and integrate them into contracts and agreements with suppliers and third parties.',
          explanation:
            'Contracts are the enforcement mechanism for vendor security: breach notification timelines, data handling limits, BAAs where PHI is involved, and right to security attestations. The MSP maintains standard clause expectations in the third-party risk policy and checks new critical-vendor contracts against them, flagging gaps to the client for negotiation or risk acceptance. Verify critical vendor records reference the governing agreement and note whether required clauses are present.',
          example:
            'Contract review 2026-03-22: 4 of 5 critical vendors have breach-notification clauses and BAAs where required; payment processor agreement lacks a notification SLA — flagged as risk RR-015, client requested addendum, response pending since 2026-04-10.',
          type: 'administrative',
          severity: 'high',
        },
        {
          code: 'GV.SC-06',
          title: 'Supplier Due Diligence Before Onboarding',
          description:
            'Perform planning and due diligence to reduce risks before entering into formal supplier or third-party relationships.',
          explanation:
            'Before a new vendor gets data or network access, someone should check its security posture: SOC 2 or similar attestation, security questionnaire, breach history, and data residency. The MSP runs a lightweight due-diligence checklist for critical vendors and records results on the vendor record before go-live. For low-risk vendors a shortened check is acceptable and should be documented as such. Verify recent vendor onboardings show a completed due-diligence record predating production use.',
          example:
            'New e-signature vendor onboarded 2026-04: SOC 2 Type II report obtained and reviewed 2026-04-02, questionnaire scored 88/100, no breach history found; approved by owner before first production document sent 2026-04-16. Checklist stored on vendor record.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.SC-07',
          title: 'Ongoing Supplier Risk Monitoring',
          description:
            'Understand, record, prioritize, assess, respond to, and monitor the risks posed by suppliers, their products and services, and other third parties throughout the relationship.',
          explanation:
            'Vendor risk is not a one-time onboarding check; postures change, breaches happen, and attestations expire. The MSP schedules annual reassessment of critical vendors (refreshed questionnaire or attestation), watches breach news for names on the vendor list, and records findings on the vendor record and risk register. Expired SOC 2 reports and unanswered questionnaires should surface as flags. Verify critical vendors have a reassessment within the last 12 months.',
          example:
            'Annual vendor review 2026-06: 5 of 5 critical vendors reassessed; Dentrix SOC 2 refreshed (period ending 2025-12-31). Payment processor still lacks attestation — risk RR-015 raised to high and replacement options presented at June QBR. 2 moderate vendors overdue for review by 30+ days — partial.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.SC-08',
          title: 'Suppliers in Incident Planning',
          description:
            'Include relevant suppliers and other third parties in incident planning, response, and recovery activities.',
          explanation:
            'When an incident hits, the client will need vendors fast: the MSP itself, the EDR/SOC provider, cyber insurer, breach counsel, and critical SaaS support lines. The IR plan should list these parties with 24/7 contacts and describe scenarios where each is engaged, and at least occasionally they should be included in tabletop exercises. Verify the IR plan contact roster includes third parties and was validated in the last exercise.',
          example:
            'IR plan v2.3 appendix lists 8 third-party contacts: MSP hotline, Huntress SOC, Travelers claims line, breach counsel (retained 2025-11), Dentrix emergency support. February 2026 tabletop included a simulated call to the insurer hotline; counsel contact confirmed current.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.SC-09',
          title: 'Supply Chain Practices Monitored Across Lifecycle',
          description:
            'Integrate supply chain security practices into cybersecurity and enterprise risk management programs and monitor their performance throughout the technology product and service life cycle.',
          explanation:
            'Hardware and software have lifecycles: firmware needs updating, products go end-of-life, and support agreements lapse, all of which change the risk they pose. The MSP tracks EOL/EOS dates in the RMM asset inventory, monitors vendor advisories for the deployed stack, and folds lifecycle findings into the replacement roadmap. Verify EOL tracking exists for network gear, servers, and key software, with a funded replacement plan for anything past or near end of support.',
          example:
            'Lifecycle report 2026-05: SonicWall firewall EOS 2027-03 (replacement in FY27 budget); 3 workstations on Windows 10 past 2025-10 EOL still in service running LTSC-ineligible builds — non-compliant, replacement POs issued 2026-05-28; server firmware updated to April 2026 baseline.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'GV.SC-10',
          title: 'Post-Relationship Supply Chain Provisions',
          description:
            'Include provisions in supply chain risk management plans for activities that occur after the conclusion of a partnership or service agreement.',
          explanation:
            'Vendor offboarding is as important as onboarding: data must be returned or destroyed, accounts and API keys revoked, and site access removed when a relationship ends. The MSP maintains a vendor offboarding checklist and records completion on the vendor record, including certificates of data destruction where contracts require them. Orphaned vendor accounts are a recurring audit finding. Verify terminated vendors in the last year show completed offboarding records.',
          example:
            'Former IT vendor relationship ended 2025-09: offboarding checklist completed 2025-09-18 — 2 admin accounts disabled, firewall management access revoked, RMM agent removed; however written data-destruction confirmation was never received. Partial; follow-up letter sent 2026-01-12, escalating to counsel if no response by 2026-07.',
          type: 'administrative',
          severity: 'medium',
        },
      ],
    },
    {
      code: 'ID',
      title: 'Identify',
      description:
        'Understand the organization assets, suppliers, and cybersecurity risks to inform prioritization of protection efforts.',
      controls: [
        {
          code: 'ID.AM-01',
          title: 'Hardware Asset Inventory',
          description:
            'Maintain accurate inventories of hardware managed by the organization.',
          explanation:
            'Every workstation, server, network device, mobile device, and IoT box on the client network should appear in a living inventory with owner, location, and status. The MSP achieves this with the RMM agent on managed endpoints plus periodic network discovery scans to catch unmanaged devices. The inventory is the denominator for every other control: unlisted devices are unpatched, unmonitored, and unencrypted by definition. Verify RMM device counts reconcile with discovery scan results and purchase records.',
          example:
            'N-central inventory 2026-06-10: 34 workstations, 2 servers, 9 network devices, all reporting within 24 hours. Nodeware discovery found 3 devices not in RMM (2 printers, 1 unknown MAC later identified as a personal tablet on staff Wi-Fi). Tablet moved to guest VLAN; printers added to inventory.',
          type: 'technical',
          severity: 'high',
          auto: 'ncentral',
        },
        {
          code: 'ID.AM-02',
          title: 'Software and Services Inventory',
          description:
            'Maintain inventories of software, services, and systems managed by the organization.',
          explanation:
            'The client should know what software runs where, including SaaS subscriptions, so it can be patched, licensed, and eventually retired. The RMM collects installed-software inventory from managed endpoints, while M365 enterprise app reviews and AP records surface SaaS usage. Unknown or unauthorized software found here feeds directly into PR.PS-05 restriction work. Verify the software inventory is current and includes cloud services, not just installed applications.',
          example:
            'Software inventory reviewed 2026-05-15: 61 distinct titles across fleet; 4 unauthorized (personal Dropbox on 2 machines, uTorrent on 1, legacy Java 8 on 1). Removals ticketed and completed by 2026-05-22. SaaS registry lists 9 subscriptions cross-checked against April AP export.',
          type: 'technical',
          severity: 'high',
        },
        {
          code: 'ID.AM-03',
          title: 'Network and Data Flow Maps',
          description:
            'Maintain representations of authorized network communication and internal and external network data flows.',
          explanation:
            'A current network diagram and a simple data-flow description show how systems talk to each other and where sensitive data enters and leaves. For SMB clients this is typically a one-page topology (firewall, switches, VLANs, VPN, cloud services) plus notes on where regulated data flows, kept in the documentation platform. These maps are essential for firewall reviews, incident scoping, and onboarding new technicians. Verify diagrams exist, match current firewall config and VLANs, and carry a review date within 12 months.',
          example:
            'Network diagram v4 updated 2026-02-20 after second-site VPN deployment; shows 4 VLANs (staff, servers, VoIP, guest), site-to-site tunnel, M365 and Dentrix cloud flows. PHI data-flow note reviewed alongside HIPAA assessment. Matches running firewall config per spot check.',
          type: 'technical',
          severity: 'medium',
        },
        {
          code: 'ID.AM-04',
          title: 'Supplier Services Inventory',
          description:
            'Maintain inventories of services provided by suppliers.',
          explanation:
            'This is the service-level view of the vendor list: what specific services each supplier provides, what data they touch, and how the client connects to them. The MSP records service details on each vendor record in the vendor module — hosting, payroll processing, e-mail filtering — so dependencies are visible during incidents and renewals. This inventory should agree with the vendor list from GV.SC-04. Verify each vendor record describes the service provided and the data involved.',
          example:
            'All 14 vendor records include service description and data-classification notes as of 2026-05-08; e.g. payroll provider record: processes employee PII and bank details, SFTP export weekly, no network interconnect. Two records lacked data notes at review and were completed same week.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'ID.AM-05',
          title: 'Assets Prioritized by Criticality',
          description:
            'Prioritize assets based on classification, criticality, resources, and impact on the mission.',
          explanation:
            'Not all assets are equal: the practice-management server matters more than a lobby kiosk, and protection and recovery effort should follow that ranking. The MSP tags criticality in the RMM/documentation platform (critical, standard, low) based on the business profile from GV.OC-01, and those tags drive backup tiers, patch windows, and monitoring depth. Verify critical assets are explicitly tagged and that backup and monitoring configurations actually differ by tier.',
          example:
            'Asset criticality tags applied 2026-01: 6 assets critical (2 servers, firewall, NAS, 2 imaging workstations), remainder standard. Critical tier gets hourly BCDR snapshots and 4-hour patch SLA vs. daily/72-hour for standard. Spot check confirmed backup schedules match tags.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'ID.AM-07',
          title: 'Data Inventory and Classification',
          description:
            'Maintain inventories of data and corresponding metadata for designated data types.',
          explanation:
            'The client should know what sensitive data it holds, where it lives, and roughly how much: PHI in the practice database, PII in HR files, cardholder data pathways, financial records. The MSP facilitates a data-mapping exercise and records locations in the documentation platform, optionally validated with discovery tooling or M365 content searches for regulated patterns. This map drives encryption, backup, retention, and breach-notification scoping. Verify a data inventory exists naming data types, systems, and owners, reviewed within 12 months.',
          example:
            'Data map v2 completed 2026-03-05: PHI in Dentrix cloud and local imaging store (~1.1 TB), employee PII on HR share, card data out of scope (P2PE terminal only). M365 content search found 214 files with SSN patterns on a legacy share — migrated to restricted library 2026-03-20.',
          type: 'administrative',
          severity: 'high',
        },
        {
          code: 'ID.AM-08',
          title: 'Asset Lifecycle Management',
          description:
            'Manage systems, hardware, software, services, and data throughout their life cycles.',
          explanation:
            'Assets need managed beginnings and endings: standard provisioning images, tracked warranty and EOL dates, secure wipe or destruction at disposal, and data retention/disposal schedules. The MSP enforces a build checklist for new devices, tracks lifecycle dates in the RMM, and uses certified disposal (with certificates) for retired drives. Data lifecycle is covered by a retention schedule in the policy set. Verify disposal certificates exist for retired assets and new devices follow the documented build standard.',
          example:
            '2026-Q1 refresh: 5 workstations deployed from standard Autopilot profile (BitLocker, EDR, RMM verified on checklist); 5 retired units wiped, destruction certificates from e-cycler dated 2026-03-28 on file. Retention schedule v1.1 defines 7-year record retention per state dental board rules.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'ID.RA-01',
          title: 'Vulnerabilities Identified and Recorded',
          description:
            'Identify, validate, and record vulnerabilities in organizational assets.',
          explanation:
            'Regular vulnerability scanning turns unknown exposure into a workable list. The MSP runs continuous or at least monthly internal scans (Nodeware sensor on the client network) plus periodic external scans of public IPs, validates findings to remove false positives, and tracks remediation by severity-based SLA. Scan coverage must match the asset inventory or blind spots persist. Verify scans are recent, cover all subnets, and criticals are remediated or accepted within the documented SLA.',
          example:
            'Nodeware sensor scanning continuously; 2026-06-01 report: 0 critical, 4 high, 22 medium across 45 assets, fleet score 87. Two highs are the EOL imaging workstations (tracked under GV.SC-09); other 2 patched within 9 days. External scan of 2 public IPs clean except TLS 1.0 on legacy VPN portal — remediation ticketed.',
          type: 'technical',
          severity: 'high',
          auto: 'nodeware',
          autoCheck: 'vuln_scan',
        },
        {
          code: 'ID.RA-02',
          title: 'Threat Intelligence Received',
          description:
            'Receive cyber threat intelligence from information-sharing forums and sources.',
          explanation:
            'Someone should be watching threat feeds relevant to the client stack so new exploitation campaigns prompt timely action. For SMB clients this is realistically the MSP function: CISA advisories, vendor security bulletins, EDR-provider threat reports, and industry ISAC digests where applicable. The value is the link to action — advisories about deployed products should generate patch or mitigation tickets. Verify subscriptions exist and at least one recent advisory demonstrably drove a remediation.',
          example:
            'MSP subscribes to CISA KEV alerts, Huntress threat advisories, and SonicWall PSIRT. 2026-04-19 SonicWall advisory triggered emergency firmware update on client firewall within 48 hours (ticket T-89561). Advisory-to-ticket workflow documented in SOC runbook.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'ID.RA-03',
          title: 'Threats Identified and Recorded',
          description:
            'Identify and record internal and external threats to the organization.',
          explanation:
            'The risk register should name the realistic threat scenarios for this client: ransomware via phishing, BEC/invoice fraud, insider data theft, vendor compromise, and physical theft, rather than generic categories. The MSP facilitates a short threat-identification discussion during the annual risk assessment, informed by the client industry and past incidents. Recorded threats pair with vulnerabilities to produce the risk analysis in ID.RA-04/05. Verify the register contains client-specific threat entries updated within 12 months.',
          example:
            'Threat catalog refreshed at 2026-02 annual risk assessment: 9 scenarios recorded including BEC targeting the bookkeeper (two real attempts logged in 2025), ransomware via macro documents, and theft from the unlocked server closet. Each linked to register entries with scores.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'ID.RA-04',
          title: 'Threat Impact and Likelihood Assessed',
          description:
            'Identify and record the potential impacts and likelihoods of threats exploiting vulnerabilities.',
          explanation:
            'Each identified threat-vulnerability pairing needs an honest estimate of how likely it is and how bad it would be, in business terms like downtime hours and dollar cost. The MSP scores these in the risk register using the standardized matrix from GV.RM-06, informed by scan data, incident history, and industry loss statistics. These estimates justify spending decisions, so they should be defensible rather than reflexively high. Verify register entries carry both likelihood and impact values with brief rationale.',
          example:
            'Register review 2026-02-28: all 11 risks scored with rationale notes; e.g. ransomware entry scored likelihood 3/5 (email is primary vector, SAT click rate 7%) and impact 5/5 (est. $85k for 3-day outage based on daily production revenue). Insurer worksheet figures reused for impact estimates.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'ID.RA-05',
          title: 'Risk Prioritization from Threat Analysis',
          description:
            'Use threats, vulnerabilities, likelihoods, and impacts to understand inherent risk and inform risk response prioritization.',
          explanation:
            'This is where analysis becomes a ranked to-do list: combine the scored risks into a prioritized treatment plan so the highest risks get remediation budget and calendar time first. The MSP produces a risk treatment roadmap from the register, presented to leadership with recommended responses and costs. The output should visibly drive the project queue. Verify a current prioritized treatment plan exists and top risks map to active or completed remediation projects.',
          example:
            'Risk treatment roadmap 2026 approved at Q1 QBR: top 3 risks (EOL workstations, missing VPN MFA, payment vendor attestation) all have funded actions with target dates. Two completed by 2026-06 (workstations replaced, Duo added to VPN); vendor item in progress.',
          type: 'administrative',
          severity: 'high',
        },
        {
          code: 'ID.RA-06',
          title: 'Risk Responses Chosen and Tracked',
          description:
            'Choose, prioritize, plan, track, and communicate risk responses.',
          explanation:
            'Every register entry needs a decided response — mitigate, transfer, avoid, or accept — with an owner, plan, and due date, tracked to completion. The platform risk register provides the workflow; the MSP reports status at QBRs and chases overdue items. Acceptances require the authority defined in GV.RM-04 and should carry expiration dates so they are re-examined. Verify no register entry sits without a response decision and overdue treatments are escalated.',
          example:
            'Register status 2026-06-15: 11 entries — 6 mitigations complete, 2 in progress on schedule, 2 accepted with owner sign-off and 12-month expiry, 1 transferred (cyber policy limits increased). One mitigation (server closet lock) ran 45 days overdue before completion; escalation noted in QBR minutes.',
          type: 'administrative',
          severity: 'high',
        },
        {
          code: 'ID.RA-07',
          title: 'Changes and Exceptions Risk-Managed',
          description:
            'Manage changes and exceptions, assess them for risk impact, and record and track them.',
          explanation:
            'Changes to the environment — new firewall rules, new SaaS, admin access grants — and exceptions to policy should pass through a lightweight change process that considers security impact. For SMB clients the MSP ticketing system serves as the change record: request, risk note, approval, implementation, and rollback plan for significant changes. Exceptions (e.g., a user exempted from MFA temporarily) need expiry dates and periodic review. Verify significant changes have tickets with approval and risk notes, and the exception list is short and current.',
          example:
            'Change sampling 2026-Q2: 6 of 6 firewall changes ticketed with approval and rule justification. Exception register holds 1 item: shared clinic-floor account exempt from screen-lock policy, approved 2026-03-01 with 6-month expiry and compensating badge access. Prior quarter had 2 undocumented DNS changes — process reinforced with techs.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'ID.RA-08',
          title: 'Vulnerability Disclosure Handling',
          description:
            'Establish processes for receiving, analyzing, and responding to vulnerability disclosures.',
          explanation:
            'If an outside researcher, customer, or vendor reports a security flaw in the client systems or website, there must be a route for that report to reach someone who acts on it. For SMBs this is a monitored security@ mailbox or website contact plus an internal handling note in the IR plan describing triage and response. Vendor-published vulnerabilities in deployed products route through the ID.RA-02 advisory workflow. Verify the intake channel exists, is monitored, and the handling steps are documented.',
          example:
            'security@clientdomain.com created 2025-12-04, forwarding to MSP service desk with 1-business-day triage SLA; address published on website footer. Tested 2026-05-11 with simulated disclosure email — ticket auto-created and triaged in 3 hours. IR plan section 2.4 documents handling steps.',
          type: 'administrative',
          severity: 'low',
        },
        {
          code: 'ID.RA-09',
          title: 'Hardware and Software Authenticity Verified',
          description:
            'Assess the authenticity and integrity of hardware and software prior to acquisition and use.',
          explanation:
            'Devices and software should come from trusted channels: authorized distributors for hardware, vendor-official download sources with signature or hash verification for software, and no gray-market network gear. The MSP enforces this through its procurement standards and by restricting software installation to vetted packages deployed via RMM. Counterfeit gear and trojanized installers are the threats here. Verify procurement runs through authorized channels and deployment packages come from vendor-official sources.',
          example:
            'Procurement policy requires purchase via authorized distributors (Ingram, D&H); all 2026 hardware POs comply. Software deployed via RMM package library sourced from vendor sites with checksums recorded. Exception found 2026-01: tech installed a PDF utility from a mirror site — package replaced with vendor build, library policy re-briefed.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'ID.RA-10',
          title: 'Critical Suppliers Assessed Pre-Acquisition',
          description:
            'Assess critical suppliers prior to acquisition of their products or services.',
          explanation:
            'Before committing to a critical product or service, the client should evaluate the supplier itself, not just the feature list: security attestations, financial viability, support quality, and breach history. This overlaps with GV.SC-06 due diligence but focuses on pre-purchase evaluation of suppliers that will become critical. The MSP performs this review as part of solution recommendations and records the evaluation with the vendor record. Verify recent critical acquisitions show a documented supplier evaluation predating the purchase decision.',
          example:
            'BCDR platform selection 2025-10: 3 suppliers evaluated on security (SOC 2, immutability architecture), viability, and support; scoring matrix retained on the winning vendor record. Decision memo approved by owner 2025-10-27 before contract signature 2025-11-05.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'ID.IM-01',
          title: 'Improvements from Evaluations',
          description:
            'Identify improvements from evaluations of the cybersecurity program.',
          explanation:
            'Assessments, audits, and compliance scoring in this platform should end in an improvement backlog, not a filed report. The MSP converts each assessment finding into a tracked remediation item with owner and target date, and trends scores across assessment cycles to show progress. Verify the latest assessment findings exist as tracked items and prior-cycle items show closure.',
          example:
            '2026-02 CSF assessment produced 17 findings; all entered as remediation tasks. As of 2026-06-15: 11 closed, 4 in progress, 2 accepted. Score improved 61% to 74% versus the 2025-02 baseline; trend chart included in QBR deck.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'ID.IM-02',
          title: 'Improvements from Tests and Exercises',
          description:
            'Identify improvements from security tests and exercises, including those coordinated with suppliers and third parties.',
          explanation:
            'Tabletop exercises, backup restore tests, phishing simulations, and any penetration testing should each generate lessons and concrete fixes. The MSP runs at least an annual IR tabletop and quarterly restore tests, documents what failed or dragged, and tickets the fixes. Including third parties like the SOC vendor or insurer hotline in exercises validates those seams too. Verify exercise reports exist with dated action items and evidence of follow-through.',
          example:
            'IR tabletop 2026-02-12 (ransomware scenario, Huntress SOC contact simulated): 3 findings — outdated after-hours contact for office manager, no printed IR plan copy, unclear insurer-notification trigger. All corrected by 2026-03-15. Q1 restore test passed; Q4-2025 test had found one server image unbootable, since fixed.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: 'ID.IM-03',
          title: 'Improvements from Operations',
          description:
            'Identify improvements from execution of operational processes, procedures, and activities.',
          explanation:
            'Day-to-day operations reveal weaknesses before incidents do: recurring ticket patterns, backup jobs that need manual restarts, alerts that are always noise. The MSP should review operational metrics and ticket trends for the client and turn recurring friction into process or tooling changes. Post-incident reviews for even minor events feed the same backlog. Verify there is a periodic operations review and examples of process changes it produced.',
          example:
            'Monthly ops review 2026-05 noted 14 repeat tickets for a flaky VPN client version; standardized fleet on v5.2 via RMM push 2026-05-20, repeat tickets dropped to 0 in June. Alert tuning in April cut noisy disk-space alerts by 70%, improving response time to real alerts.',
          type: 'administrative',
          severity: 'low',
        },
        {
          code: 'ID.IM-04',
          title: 'Incident Response and Cybersecurity Plans Maintained',
          description:
            'Establish, communicate, maintain, and improve incident response plans and other cybersecurity plans that affect operations.',
          explanation:
            'The client needs current, accessible response and continuity documentation: an incident response plan, a disaster recovery/BCDR runbook, and communication templates. The MSP maintains these in the documentation platform, keeps offline/printed copies reachable during an outage, and updates them after each exercise or real event. Staleness is the main failure: wrong contacts, retired systems, outdated insurer details. Verify plans exist, carry a review within 12 months, and reflect current systems and contacts.',
          example:
            'IR plan v2.3 (reviewed 2026-02-12 post-tabletop) and DR runbook v1.8 (updated 2026-03 after BCDR appliance replacement) stored in platform; printed copies in both office safes confirmed during 2026-04 site visit. Contact roster verified current; next review due 2027-02.',
          type: 'administrative',
          severity: 'high',
        },
      ],
    },
    // __APPEND__
  ],
};
