// HIPAA Security Rule framework content (built-in).
// Scope: controls an MSP implements, verifies, or facilitates for covered-entity
// and business-associate clients. Purely HR/legal/facilities obligations that the
// client owns outright are intentionally excluded.
//
// IMPORTANT: `code` values are DB upsert keys — never change them.

import type { FrameworkData } from './types.js';

export const HIPAA_FRAMEWORK: FrameworkData = {
  key: 'hipaa',
  name: 'HIPAA Security Rule',
  shortName: 'HIPAA',
  version: '2013',
  description:
    'Health Insurance Portability and Accountability Act Security Rule — administrative, physical, and technical safeguards for electronic Protected Health Information (ePHI).',
  nistMappingEnabled: false,
  contentVersion: 2,
  metadata: { publisher: 'HHS Office for Civil Rights', effectiveDate: '2013-03-26' },
  areas: [
    {
      code: 'ADM',
      title: 'Administrative Safeguards (§164.308)',
      description:
        'Policies, processes, and workforce-facing controls that govern how ePHI risk is assessed, access is managed, staff are trained, incidents are handled, and data is kept recoverable.',
      controls: [
        {
          code: '164.308(a)(1)',
          title: 'Security Management Process',
          description:
            'Maintain a documented security program that prevents, detects, contains, and corrects security violations affecting ePHI.',
          explanation:
            'This is the umbrella control for the whole HIPAA security program: the client needs written policies, a defined owner, and an operating rhythm for finding and fixing security problems. An MSP typically satisfies it by running a managed security stack (RMM patching, EDR, SIEM/SOC alerting) under a documented scope of services and by holding recurring security reviews (QBRs) where open risks are tracked to closure. Policy documents can live in the MSP documentation platform (IT Glue, Hudu) with review dates. Verify by confirming a current, approved security policy set exists and that violations found by tooling actually flow into tickets and get remediated.',
          example:
            'Compliant — Written information security policy set (v3.2, approved 2026-01-15 by practice administrator) stored in IT Glue; security violations route from Huntress and N-central into the PSA as P2 tickets; reviewed 14 closed security tickets from Q1 2026 showing containment and correction steps documented.',
          type: 'administrative',
        },
        {
          code: '164.308(a)(1)(ii)(A)',
          title: 'Risk Analysis',
          description:
            'Conduct and document an accurate, thorough assessment of risks and vulnerabilities to the confidentiality, integrity, and availability of ePHI.',
          explanation:
            'HIPAA requires a formal risk analysis that inventories where ePHI lives (EHR, file shares, email, imaging systems, backups), identifies threats and vulnerabilities to each, and rates likelihood and impact. MSPs typically facilitate this annually using a structured tool or template (the HHS SRA Tool, Nodeware or similar vulnerability scans, plus an asset inventory pulled from the RMM). OCR treats a missing or stale risk analysis as the most common audit failure, so the document must be dated, scoped to all ePHI systems, and refreshed after major changes. Verify a completed risk analysis exists, is less than 12 months old, and that its findings feed the risk management plan.',
          example:
            'Compliant — Annual SRA completed 2026-03-04 using HHS SRA Tool v3.5 covering EHR (athenahealth), on-prem file server, M365, and Datto backups; 11 risks identified and transferred to the remediation register. Prior-year gap (unscanned imaging workstation) closed.',
          type: 'administrative',
        },
        {
          code: '164.308(a)(1)(ii)(B)',
          title: 'Risk Management',
          description:
            'Implement and track security measures that reduce identified risks to ePHI to a reasonable and appropriate level.',
          explanation:
            'Risk management is the follow-through on the risk analysis: every identified risk needs a decision (remediate, mitigate, or formally accept) and remediated items need evidence. MSPs implement this as a living remediation register or project board tied to the risk analysis, with dated entries showing what was deployed — for example enabling MFA via Duo, rolling BitLocker through Intune, or closing vulnerability findings from Nodeware scans. Risk acceptance by the client should be in writing. Verify by sampling risks from the last analysis and confirming each has a documented disposition and completion evidence.',
          example:
            'Partial — Remediation register exists and 8 of 11 risks from the 2026 SRA are closed with evidence; 3 items (legacy Windows Server 2012 R2 host, shared front-desk login, missing DR test) remain open past their 90-day target. Follow-up project scheduled for 2026-08.',
          type: 'administrative',
        },
        {
          code: '164.308(a)(1)(ii)(D)',
          title: 'Information System Activity Review',
          description:
            'Review logs, audit trails, and security reports for systems containing ePHI on a regular, documented schedule.',
          explanation:
            'The client (or the MSP on their behalf) must regularly look at system activity — sign-in logs, EHR audit trails, file access records, and security alerts — not just collect them. MSPs typically satisfy this with a managed SIEM or SOC service (Huntress SIEM, Blumira, or M365 unified audit log reviews) that generates alerts plus a monthly or quarterly documented review of activity reports. The review needs a record: who looked, when, what was found, and what tickets resulted. Verify by confirming log sources cover all ePHI systems and by sampling recent review records or SOC escalations.',
          example:
            'Compliant — Huntress SIEM ingests M365 sign-in, firewall, and server event logs; SOC escalations reviewed within 24h. Monthly activity review checklist completed by assigned tech (last: 2026-06-02) and stored in the PSA; two anomalous sign-ins in May investigated and closed as travel.',
          type: 'administrative',
          auto: 'huntress',
          autoCheck: 'siem_logging',
        },
        {
          code: '164.308(a)(2)',
          title: 'Assigned Security Responsibility',
          description:
            'Designate in writing a single security official responsible for the development and implementation of HIPAA security policies and procedures.',
          explanation:
            'Every covered entity must name one person accountable for security — typically the practice administrator or office manager, with the MSP acting as their technical delegate. The designation should be a written, dated record naming the individual and summarizing their duties; the MSP service agreement can document which operational duties are delegated to the MSP. This is a facilitation item: the MSP cannot be the security official, but should prompt the client to appoint one and keep the record current when staff turn over. Verify a current written designation exists and the named person still works there.',
          example:
            'Compliant — Security Official designation memo on file naming practice manager J. Alvarez (signed 2025-11-10); MSP master services agreement Appendix B documents delegated technical duties. Confirmed Alvarez still employed during June 2026 review.',
          type: 'administrative',
        },
        {
          code: '164.308(a)(3)',
          title: 'Workforce Security',
          description:
            'Establish procedures so that each workforce member has access to ePHI appropriate to their role, and no more.',
          explanation:
            'This standard requires role-based access: front desk, clinical, billing, and admin staff should each have access matched to their job, enforced through security groups rather than ad hoc grants. MSPs implement it with role-based security groups in Active Directory or Entra ID, EHR role templates, and a documented joiner/mover/leaver process driven by PSA tickets from the client. Access changes should only happen on an authorized request from a named client approver. Verify by comparing a sample of user accounts and group memberships against the documented role matrix.',
          example:
            'Compliant — Role matrix (5 roles) documented in Hudu; Entra ID group membership for 28 users matches assigned roles; all 6 access-change tickets in Q2 originated from the authorized approver (practice manager). One stale group membership found and removed during review.',
          type: 'administrative',
        },
        {
          code: '164.308(a)(3)(ii)(A)',
          title: 'Authorization and/or Supervision',
          description:
            'Require documented authorization before any workforce member is granted access to systems containing ePHI.',
          explanation:
            'New or changed access to ePHI systems must be approved by someone with authority — no accounts created from a hallway conversation or an email from the employee themselves. MSPs implement this with a new-user request form or PSA ticket type that captures the approver, role, start date, and required systems, and by restricting who at the client may authorize requests. The approval record is the evidence, so tickets should retain the requester identity. Verify by sampling recent account-creation tickets and confirming each shows an authorized approver before provisioning.',
          example:
            'Compliant — All 4 new-hire onboarding tickets in H1 2026 used the standard request form with practice manager approval captured before account creation; approver allowlist enforced in the PSA intake workflow. No accounts provisioned outside the process.',
          type: 'administrative',
        },
        {
          code: '164.308(a)(3)(ii)(B)',
          title: 'Workforce Clearance Procedure',
          description:
            'Verify that the access each workforce member holds to ePHI remains appropriate for their current role.',
          explanation:
            'Beyond initial authorization, the client needs a way to confirm access stays appropriate over time — the practical implementation is a periodic user access review. MSPs typically run a quarterly or semiannual review: export all accounts and group memberships from Entra ID/AD and the EHR, have the client owner attest each user and permission level, and remediate anything flagged. Automated reports from the RMM or Entra access reviews make this repeatable. Verify by confirming a completed, signed-off access review exists within the last review cycle and that flagged items were actioned.',
          example:
            'Compliant — Semiannual access review completed 2026-05-20; Entra ID and eClinicalWorks user exports attested line-by-line by the practice manager; 2 accounts downgraded (billing temp, former per-diem RN) within 3 business days. Sign-off PDF attached to review ticket #48211.',
          type: 'administrative',
        },
        {
          code: '164.308(a)(3)(ii)(C)',
          title: 'Termination Procedures',
          description:
            'Disable all access to ePHI promptly when a workforce member leaves or changes roles, following a documented offboarding procedure.',
          explanation:
            'Terminated employees with live credentials are one of the highest-probability breach paths, so offboarding must be fast and complete: disable AD/Entra accounts, revoke M365 sessions and MFA tokens, remove EHR access, reclaim devices, and rotate any shared credentials the person knew. MSPs implement this as a standard offboarding checklist/ticket template with an SLA (same business day for terminations), triggered by the client and executed by the service desk. Automated scripts or Entra lifecycle workflows reduce misses. Verify by sampling recent offboarding tickets and comparing account-disable timestamps against separation dates, and by checking for enabled accounts with no recent sign-ins.',
          example:
            'Non-compliant — Offboarding checklist exists, but review found former biller (separated 2026-04-30) with an enabled Entra account until 2026-05-14 because the client reported the termination late; account disabled during review, EHR access confirmed already removed. Recommended client commit to same-day termination notifications; follow-up in 30 days.',
          type: 'administrative',
          severity: 'high',
        },
        {
          code: '164.308(a)(4)',
          title: 'Information Access Management',
          description:
            'Implement documented policies for authorizing, granting, and modifying access to ePHI based on job role.',
          explanation:
            'This standard covers the policy layer behind access control: written rules stating who may access which ePHI systems, at what privilege level, and how access is requested and changed. MSPs implement it with a least-privilege access policy, role-to-permission mappings for AD/Entra security groups and EHR roles, and separate admin accounts for privileged work. The policy should also cover third parties such as the EHR vendor and the MSP itself. Verify the written policy exists, matches how access is actually provisioned, and that privileged access is limited to named administrators.',
          example:
            'Compliant — Access management policy v2.1 documents role-based grants and least privilege; only 2 named client users plus the MSP hold Entra Global Admin, each with a separate non-admin daily account; EHR vendor support access is time-boxed per session and logged.',
          type: 'administrative',
        },
        {
          code: '164.308(a)(5)',
          title: 'Security Awareness and Training',
          description:
            'Deliver ongoing security awareness training to every workforce member, including management, with completion tracked.',
          explanation:
            'All staff who touch ePHI need recurring security training — typically annual formal training plus ongoing phishing simulation — and the client must be able to prove completion. MSPs commonly deliver this through a managed SAT platform (Huntress SAT, KnowBe4, Breach Secure Now) with HIPAA-specific modules, enrollment synced to the user directory, and automated reminders for non-completers. New hires should be enrolled during onboarding. Verify via the platform completion report: enrollment should match the active user list and completion should be at or near 100 percent with stragglers escalated to management.',
          example:
            'Compliant — Huntress SAT enrollment matches all 28 active users; 2025-26 HIPAA course completion at 100% as of 2026-06-01; monthly phishing simulations running with 3.4% click rate (down from 11% at baseline). Completion report exported to compliance folder.',
          type: 'administrative',
          auto: 'huntress',
          autoCheck: 'sat_completion',
        },
        {
          code: '164.308(a)(5)(ii)(A)',
          title: 'Security Reminders',
          description:
            'Send periodic security updates and reminders to the workforce between formal training cycles.',
          explanation:
            'Annual training decays quickly, so HIPAA expects ongoing reinforcement: newsletters, micro-training, posters, or alert bulletins about current threats. MSPs typically satisfy this through the SAT platform automated monthly micro-lessons or newsletters, plus ad hoc client-wide advisories when relevant threats emerge (for example an active phishing campaign impersonating the EHR vendor). Keep copies or send logs as evidence. Verify that reminders went out on a regular cadence over the past year, not just around audit time.',
          example:
            'Compliant — Breach Secure Now monthly micro-training and security newsletter delivered to all staff (12 of 12 months verified in platform send log); two ad hoc advisories issued in 2026 (MFA-fatigue attacks in Feb, EHR-vendor phishing lure in May) archived in the client documentation space.',
          type: 'administrative',
        },
        {
          code: '164.308(a)(5)(ii)(B)',
          title: 'Protection from Malicious Software',
          description:
            'Deploy and monitor controls that guard against, detect, and report malicious software on all systems that touch ePHI.',
          explanation:
            'Every workstation and server in scope needs modern anti-malware — in practice a managed EDR/MDR platform (Huntress, SentinelOne, Defender for Business) with 24/7 detection and response, not just legacy signature AV. The MSP is responsible for full deployment coverage, agent health monitoring via the RMM, and an escalation path when detections fire. Coverage gaps (unprotected endpoints) are the most common failure, so reconcile the EDR console against the RMM asset inventory. Verify agent coverage is 100 percent of in-scope endpoints, agents are healthy and current, and recent detections show timely response.',
          example:
            'Compliant — Huntress EDR deployed to 42/42 workstations and 3/3 servers (reconciled against N-central inventory 2026-06-10); all agents healthy; 2 detections in Q2 isolated by SOC within 15 minutes and remediated same day per incident tickets #47102 and #48533.',
          type: 'administrative',
          auto: 'huntress',
          autoCheck: 'edr_active',
        },
        {
          code: '164.308(a)(5)(ii)(C)',
          title: 'Log-in Monitoring',
          description:
            'Monitor log-in attempts across ePHI systems and investigate and report discrepancies such as failed or anomalous sign-ins.',
          explanation:
            'The organization must watch authentication activity for signs of attack: repeated failures, impossible-travel sign-ins, logins at odd hours, or use of dormant accounts. MSPs implement this with Entra ID sign-in log monitoring, conditional access with risk-based policies, and SIEM/SOC alerting (Huntress ITDR or SIEM, Blumira) that escalates suspicious authentication to the service desk. On-prem AD failed-logon events should also be captured where domain controllers exist. Verify alert rules are active for the tenant and DCs, and sample recent alerts to confirm they were investigated and documented.',
          example:
            'Compliant — Huntress ITDR monitoring the M365 tenant; Entra sign-in risk policies block high-risk sign-ins; 3 alerts in Q2 (2 password-spray attempts blocked, 1 legacy-auth attempt from retired copier account) investigated and documented; the copier account was disabled as a corrective action.',
          type: 'technical',
          auto: 'huntress',
          autoCheck: 'soc_monitoring',
        },
        {
          code: '164.308(a)(5)(ii)(D)',
          title: 'Password Management',
          description:
            'Enforce technical password standards and safe credential-handling procedures for all accounts with access to ePHI.',
          explanation:
            'Passwords protecting ePHI need enforced technical standards: minimum length and complexity or modern passphrase policy, banned-password lists, lockout thresholds, and no credential sharing or sticky notes. MSPs implement this through Entra ID password protection and on-prem AD fine-grained policies, pair it with MFA, and provide a business password manager (Keeper, 1Password Business) so staff stop reusing passwords. Shared clinical workstation logins are a common violation to hunt for. Verify the tenant/domain password policy settings, spot-check for shared accounts, and confirm password manager adoption.',
          example:
            'Partial — Entra password protection enforced (14-char minimum, banned list, smart lockout) and Keeper deployed to 24 of 28 users; found one shared "frontdesk" account still in use at check-in workstations. Remediation ticket #49107 open to issue individual accounts by 2026-07-15.',
          type: 'technical',
          auto: 'm365',
          autoCheck: 'password_policy',
        },
        {
          code: '164.308(a)(6)',
          title: 'Security Incident Procedures',
          description:
            'Maintain a written incident response procedure covering how security incidents involving ePHI are reported, triaged, and handled.',
          explanation:
            'The client needs a documented plan stating what counts as a security incident, who staff report it to, who leads response, and when the MSP, insurer, legal counsel, and (if a breach) regulators get involved. MSPs typically supply an incident response plan template tailored to the client, wire their own SOC/EDR escalations into it, and keep contact trees current. The plan should name the MSP escalation path and reference breach-notification obligations. Verify the written IRP exists, is dated within the last year, and that staff-facing reporting instructions are actually distributed.',
          example:
            'Compliant — Incident response plan v1.4 (updated 2026-02-11) on file with contact tree including MSP SOC, cyber insurer hotline, and privacy officer; staff reporting instructions posted in the employee handbook and reinforced in annual training.',
          type: 'administrative',
        },
        {
          code: '164.308(a)(6)(ii)',
          title: 'Response and Reporting',
          description:
            'Respond to suspected or known security incidents, mitigate harmful effects, and document each incident and its outcome.',
          explanation:
            'This is the operational half of incident response: incidents must actually be worked — contained, eradicated, recovered — and every incident needs a written record of what happened, what data was involved, and what was done. MSPs implement this through SOC-driven response (EDR host isolation, credential resets, session revocation) tracked in PSA incident tickets with a post-incident summary, and a severity rubric that flags potential ePHI exposure for breach assessment. Tabletop exercises once a year strengthen the muscle. Verify by reviewing recent incident tickets for containment steps, timelines, ePHI-impact assessment, and closure notes.',
          example:
            'Compliant — 3 incidents documented in 2026 YTD; sample ticket #47102 (malware on nurse-station PC) shows Huntress isolation at 09:14, reimage same day, credential reset, and a written ePHI-impact assessment concluding no exposure (device confirmed PHI-free, EHR is browser-based with no cached data). Annual tabletop completed 2026-03-19.',
          type: 'administrative',
        },
        {
          code: '164.308(a)(7)',
          title: 'Contingency Plan',
          description:
            'Establish a written contingency plan for responding to emergencies or failures that damage systems containing ePHI.',
          explanation:
            'The contingency standard is the umbrella over backup, disaster recovery, and emergency operations: a written plan that says how the practice keeps functioning and recovers ePHI after ransomware, hardware failure, fire, or extended outage. MSPs typically author this plan from their BCDR stack — documenting RTO/RPO targets, backup architecture, recovery runbooks, and roles — and review it annually with the client. It should also identify which applications and data are most critical (criticality analysis). Verify the plan exists in writing, reflects the current environment, and names realistic recovery objectives the deployed tooling can actually meet.',
          example:
            'Compliant — BCDR plan v2.0 (reviewed 2026-01-28) documents 4-hour RTO / 1-hour RPO for the EHR-adjacent file server via Datto SIRIS local virtualization, cloud failover for M365 data, and a criticality ranking of 9 business systems; plan stored in IT Glue and a printed copy held by the practice manager.',
          type: 'administrative',
        },
        {
          code: '164.308(a)(7)(ii)(A)',
          title: 'Data Backup Plan',
          description:
            'Create and maintain retrievable, exact copies of all ePHI through an automated, monitored backup system.',
          explanation:
            'Every system holding ePHI needs automated backups that can actually be restored: servers, file shares, M365/Google Workspace data (SaaS backup such as Datto SaaS Protection or Afi), and confirmation of the EHR vendor backup arrangements for hosted systems. Modern expectations include the 3-2-1 pattern, offsite/cloud copies, immutability or air-gapping against ransomware, and encryption of backup data. MSPs monitor backup jobs daily through the RMM or backup portal and perform periodic test restores with documented results. Verify backup scope covers all ePHI sources, jobs are succeeding, retention meets policy, and a test restore succeeded recently.',
          example:
            'Compliant — Datto SIRIS backs up both servers hourly with cloud replication and immutable snapshots; Datto SaaS Protection covers all 28 M365 mailboxes/OneDrive/SharePoint; EHR is vendor-hosted with backup terms confirmed in the BAA. Last 30 days of jobs green; monthly test restore of patient-docs share verified 2026-06-05 (checksum match).',
          type: 'technical',
          severity: 'critical',
        },
        {
          code: '164.308(a)(7)(ii)(B)',
          title: 'Disaster Recovery Plan',
          description:
            'Maintain and test documented procedures to restore any loss of ePHI and return systems to normal operation after a disaster.',
          explanation:
            'Beyond having backups, the client needs step-by-step recovery procedures: how to virtualize or restore each server, rebuild network services, recover M365 data, and re-establish EHR access, in what order, and who executes each step. MSPs write these as runbooks tied to the BCDR platform and prove them with at least an annual DR test — a screenshot-verified virtualization of production servers or a full restore exercise — with results and timings documented. An untested DR plan is treated as a gap. Verify runbooks exist for every critical system and the most recent DR test met the stated RTO.',
          example:
            'Compliant — DR runbooks documented per server in IT Glue; annual DR test on 2026-04-22 virtualized both production servers on the Datto appliance in 38 minutes (target: 4 hours), domain services and file shares verified functional; test report with screenshots attached to ticket #46310.',
          type: 'administrative',
          severity: 'critical',
        },
        {
          code: '164.308(a)(7)(ii)(C)',
          title: 'Emergency Mode Operation Plan',
          description:
            'Document procedures that keep critical business processes protecting ePHI running while systems operate in emergency mode.',
          explanation:
            'This control covers the gap between outage and full recovery: how the practice continues to see patients and safeguard ePHI while primary systems are down. Typical MSP-facilitated content includes EHR downtime procedures (paper forms, read-only downtime viewer), failover internet or LTE, emergency access to the BCDR-virtualized environment, and rules that keep ePHI protected during workarounds (no personal email, secure storage of paper records until re-entry). The plan should state who declares emergency mode and how staff are notified. Verify emergency procedures exist for the critical systems identified in the contingency plan and that staff know where to find them.',
          example:
            'Compliant — Downtime procedures documented for the EHR (vendor downtime viewer plus paper encounter forms with re-entry checklist), LTE failover configured on the Fortinet edge, and emergency access to the Datto-virtualized file server documented; laminated downtime quick-reference posted at nurse stations, confirmed during 2026-06 onsite.',
          type: 'administrative',
          severity: 'high',
        },
        {
          code: '164.308(a)(8)',
          title: 'Evaluation',
          description:
            'Perform periodic technical and non-technical evaluations of how well security policies and controls meet HIPAA requirements.',
          explanation:
            'HIPAA requires recurring evaluation of the whole program — effectively this compliance assessment itself, repeated on a schedule and after major environmental changes (new EHR, office move, merger). MSPs implement it as an annual HIPAA assessment combining a technical review (vulnerability scan via Nodeware, configuration review of M365/firewall/endpoints) with a non-technical review of policies and procedures against each Security Rule control. Findings should be dated, tracked, and compared year over year. Verify the last full evaluation is within 12 months, covers both technical and administrative dimensions, and shows findings flowing into remediation.',
          example:
            'Compliant — Annual HIPAA evaluation completed 2026-03-04 alongside the SRA: Nodeware external/internal scans, M365 secure score review (78%), and control-by-control policy review; 6 findings logged, 4 closed, 2 in the remediation register. Prior evaluation on file from 2025-03 for trend comparison.',
          type: 'administrative',
        },
        {
          code: '164.308(b)(1)',
          title: 'Business Associate Contracts',
          description:
            'Execute and track a HIPAA business associate agreement with every vendor that creates, receives, maintains, or transmits ePHI.',
          explanation:
            'Any vendor touching ePHI — the MSP itself, the EHR vendor, SaaS backup provider, e-fax and transcription services, billing companies, shredding vendors — must sign a business associate agreement before handling data. MSPs facilitate this by maintaining a vendor inventory that flags ePHI exposure, confirming a signed BAA exists for each flagged vendor (including the MSP own BAA with the client), and reviewing the list annually as tools change. Missing BAAs are a frequent OCR enforcement trigger. Verify the vendor list is current and a signed, dated BAA is on file for every ePHI-handling vendor.',
          example:
            'Partial — Vendor inventory lists 9 ePHI-handling vendors; signed BAAs on file for 8 including the MSP (signed 2024-09-01) and Datto; new e-fax provider (added 2026-04) has no BAA yet — vendor BAA requested 2026-06-11, ticket #49220 tracking. E-fax use paused for referrals until executed.',
          type: 'administrative',
          severity: 'high',
        },
      ],
    },
    {
      code: 'PHY',
      title: 'Physical Safeguards (§164.310)',
      description:
        'Physical protections for the systems and media that store or access ePHI — server and network equipment access, workstation placement and security, and controlled handling of devices and media.',
      controls: [
        {
          code: '164.310(a)(1)',
          title: 'Facility Access Controls',
          description:
            'Limit physical access to servers, network closets, and other equipment hosting ePHI to authorized personnel only.',
          explanation:
            'From an IT-management standpoint this control is about the rooms and racks that hold ePHI infrastructure: server rooms, network closets, and backup appliances must be locked and access restricted to a short authorized list. MSPs facilitate it by documenting where equipment lives, recommending locked racks or closets with keyed or badge access, keeping the authorized-access list in the documentation platform, and noting physical conditions during onsite visits. For cloud-hosted EHRs, the datacenter obligations shift to the vendor under the BAA, but on-prem gear remains in scope. Verify equipment locations are locked, the access list is current, and spare keys or codes are controlled.',
          example:
            'Compliant — Server and Datto appliance housed in a locked closet with keypad access; code known to practice manager and MSP field techs only, rotated after the March staff departure; network switch in a locked wall cabinet in the hallway; conditions photographed and documented during the 2026-06-17 onsite.',
          type: 'physical',
          severity: 'high',
        },
        {
          code: '164.310(a)(2)(iii)',
          title: 'Access Control and Validation',
          description:
            'Control and validate physical access to areas containing ePHI systems based on role, including visitor and vendor escort procedures.',
          explanation:
            'Beyond locking the door, the client needs role-based rules for who may enter equipment areas and a procedure for visitors and vendors — copier techs, ISP installers, EHR field engineers — who should sign in and be escorted rather than left alone with systems. MSPs facilitate this by supplying a simple visitor/vendor access procedure, maintaining the authorized personnel list alongside the facility access documentation, and validating their own technicians against it. Software access to physical controls (badge systems, camera NVRs) should also be restricted where present. Verify a visitor procedure exists, vendor visits are logged or ticketed, and the role-based access list matches current staff.',
          example:
            'Compliant — Vendor access procedure in place: server closet entry requires practice manager sign-off and escort; ISP technician visit on 2026-05-08 logged in ticket #48644 with escort noted; authorized-access list (3 client staff + MSP) reviewed and current as of the June access review.',
          type: 'physical',
        },
        {
          code: '164.310(b)',
          title: 'Workstation Use',
          description:
            'Define acceptable use and physical placement rules for workstations that access ePHI.',
          explanation:
            'This control requires documented rules for how and where ePHI workstations are used: acceptable-use policy, screen positioning away from patient sightlines or use of privacy filters, no personal software, and restrictions on accessing ePHI from personal or public devices. MSPs implement the technical side with RMM-enforced configuration baselines, application allow/block controls, web filtering (DNS Filter, Defender), and conditional access that blocks unmanaged devices from M365 and the EHR. The written acceptable-use policy is typically an MSP-provided template the client adopts. Verify the AUP is signed or acknowledged by staff and technical enforcement matches the written rules.',
          example:
            'Compliant — Acceptable-use policy acknowledged by all staff in the 2026 training cycle; privacy filters installed on 4 check-in workstations facing the lobby; Entra conditional access blocks EHR and M365 access from non-compliant devices; DNSFilter policy applied to all endpoints via N-central.',
          type: 'physical',
        },
        {
          code: '164.310(c)',
          title: 'Workstation Security',
          description:
            'Apply physical safeguards to every workstation that accesses ePHI to prevent unauthorized use or removal.',
          explanation:
            'Workstations in patient-accessible areas need physical protection: cable locks or secured mounts in exam rooms and reception, automatic screen locks so an unattended PC cannot be used by a passerby, and secured storage for laptops and tablets. MSPs enforce the technical portion through RMM or Intune policy (screen lock at 10 minutes or less, lock-on-smart-card-removal where used) and address the physical portion in onsite reviews and the asset inventory, which also enables detection of missing devices. Full-disk encryption (covered under 164.312) backstops theft of the device itself. Verify screen-lock policy compliance from the RMM and confirm physical securing of devices in public areas during onsite visits.',
          example:
            'Compliant — Intune policy enforces 10-minute screen lock across all 42 workstations (compliance report 2026-06-12: 42/42); exam-room PCs on locked wall mounts; 6 clinic laptops tracked in N-central asset inventory and stored in a locked cabinet overnight per front-office checklist.',
          type: 'physical',
        },
        {
          code: '164.310(d)(1)',
          title: 'Device and Media Controls',
          description:
            'Track and control the receipt, movement, and removal of hardware and electronic media that contain ePHI.',
          explanation:
            'The client must know where ePHI-bearing devices and media are at all times: workstations, laptops, servers, external drives, backup media, and multifunction copiers with internal storage. MSPs implement this with an RMM-driven asset inventory reconciled periodically against physical reality, documented procedures for device moves and retirements (tied to disposal and re-use controls), and restrictions on removable media — ideally blocking USB mass storage via Intune or endpoint policy unless there is a business need. Verify the asset inventory is current, retired assets show a documented disposition, and removable-media policy is enforced.',
          example:
            'Compliant — N-central asset inventory reconciled onsite 2026-06-17 (47 devices, zero unaccounted); USB mass storage blocked via Intune with a documented exception for the ultrasound export workstation; 3 devices retired YTD, each with disposition recorded in the asset register.',
          type: 'physical',
        },
        {
          code: '164.310(d)(2)(i)',
          title: 'Disposal',
          description:
            'Sanitize or destroy ePHI and the media it resides on before final disposal, and keep a certificate or record of destruction.',
          explanation:
            'Drives, backup media, and copier hard disks leaving service must be rendered unreadable — NIST 800-88 wipe, degaussing, or physical shredding — because discarded devices with intact PHI are a classic breach source. MSPs implement this with a standard decommissioning procedure: remove the device from the RMM and backup jobs, wipe or pull the drive, use a certified ITAD/shredding vendor for destruction, and file the certificate of destruction against the asset record. Leased copiers need contract language or a wipe step covering their internal storage at turn-in. Verify every retired asset has a matching destruction record and no ePHI-bearing devices sit unwiped in storage.',
          example:
            'Compliant — 3 retired workstations and 1 failed server drive destroyed 2026-05-30 via ShredPro (NAID AAA certified); certificates of destruction filed in IT Glue against each asset serial; copier lease addendum requires vendor drive wipe at turn-in, confirmed in the 2025 refresh paperwork.',
          type: 'physical',
          severity: 'high',
        },
        {
          code: '164.310(d)(2)(ii)',
          title: 'Media Re-Use',
          description:
            'Remove all ePHI from electronic media before the media is reassigned or reused for another purpose.',
          explanation:
            'Devices redeployed internally — a clinical workstation moved to the front desk, a returned laptop reissued to a new hire, a repurposed external drive — must be wiped or reimaged first so residual ePHI does not follow the hardware. MSPs implement this as a mandatory reimage step in the device redeployment procedure: full wipe and fresh OS deployment through Autopilot/RMM imaging rather than handing over a used profile, plus BitLocker key rotation. The redeployment ticket is the evidence trail. Verify redeployment procedures require reimaging and sample recent reassignment tickets for confirmation.',
          example:
            'Compliant — Redeployment SOP requires full Autopilot reset before reissue; both device reassignments in 2026 (tickets #46881, #48910) show wipe/reimage completed and new BitLocker keys escrowed to Entra before handoff; no drives repurposed outside the SOP.',
          type: 'physical',
        },
      ],
    },
  ],
};
