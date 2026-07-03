// CIS Critical Security Controls v8 — Implementation Groups 1 and 2.
// Built-in framework content. Safeguard codes are the upsert keys — never change them.

import type { FrameworkData } from './types.js';

export const CIS_V8_FRAMEWORK: FrameworkData = {
  key: 'cis',
  name: 'CIS Critical Security Controls v8',
  shortName: 'CIS',
  version: '8.0',
  description:
    'Center for Internet Security Critical Security Controls version 8 — prioritized safeguards for cyber defense, covering Implementation Groups 1 and 2.',
  nistMappingEnabled: false,
  contentVersion: 1,
  metadata: {
    publisher: 'Center for Internet Security',
    effectiveDate: '2021-05-18',
  },
  areas: [
    {
      code: 'CIS-1',
      title: 'Inventory and Control of Enterprise Assets',
      description:
        'Actively manage all enterprise assets connected to the infrastructure so only known, authorized devices are given access.',
      controls: [
        {
          code: '1.1',
          title: 'Establish and Maintain Detailed Enterprise Asset Inventory (IG1)',
          description:
            'Maintain an accurate, detailed inventory of all enterprise assets with the potential to store or process data, reviewed and updated at least bi-annually.',
          explanation:
            'Every workstation, server, laptop, mobile device, network appliance, and IoT device that touches company data must appear in a single authoritative inventory that records owner, network address, hardware address, and whether the asset is approved. For an MSP-managed client this is normally the RMM asset database (N-central) reconciled against Entra ID or Active Directory device records and DHCP leases. The inventory should be reviewed with the client at least twice a year and after any office move or acquisition. Verification means pulling the RMM asset list and matching it against directory and network discovery data, then explaining every gap.',
          example:
            'Compliant — N-central agent inventory of 47 endpoints and 3 servers reconciled against Entra device list on 2026-06-11; 3 unmanaged IoT thermostats identified and moved to an isolated VLAN. Next review scheduled 2026-12-15.',
          type: 'administrative',
          severity: 'high',
          auto: 'ncentral',
        },
        {
          code: '1.2',
          title: 'Address Unauthorized Assets (IG1)',
          description:
            'Ensure a weekly process exists to identify unauthorized assets and remove, deny, or quarantine them.',
          explanation:
            'When a device shows up on the network that is not in the approved inventory, someone must notice quickly and act — remove it, block it at the switch or firewall, or park it on a quarantine VLAN until it is vetted. MSPs typically implement this with network discovery scans from the RMM or a Nodeware sensor plus firewall alerts on new MAC addresses, feeding a recurring ticket for weekly review. The key evidence is a documented weekly cadence and tickets showing action taken. Verify by sampling recent weeks and confirming unknown devices were dispositioned within the window.',
          example:
            'Partial — Nodeware discovery flags new devices, but review tickets show 3 of the last 8 weeks were skipped; two unknown MACs from 2026-05-20 were not dispositioned until 2026-06-09. Weekly recurring ticket created to close the gap.',
          type: 'technical',
          severity: 'medium',
        },
        {
          code: '1.3',
          title: 'Utilize an Active Discovery Tool (IG2)',
          description:
            'Use an active discovery tool to identify assets connected to the network and update the asset inventory at least daily.',
          explanation:
            'Active discovery means a tool that probes network ranges (ping sweeps, ARP, SNMP) on a schedule rather than relying on manual entry. In an MSP stack this is typically the Nodeware sensor or the N-central network discovery job scanning each client subnet daily and feeding results into the asset inventory. Newly discovered devices should automatically create review items rather than silently appearing. Verify by checking the discovery job schedule, its last-run status, and that recently connected test devices appear within a day.',
          example:
            'Compliant — Nodeware sensor at HQ and N-central discovery jobs on both branch subnets run daily; test laptop connected 2026-06-02 appeared in the inventory queue within 4 hours.',
          type: 'technical',
          severity: 'medium',
          auto: 'nodeware',
        },
        {
          code: '1.4',
          title: 'Use Dynamic Host Configuration Protocol (DHCP) Logging to Update Enterprise Asset Inventory (IG2)',
          description:
            'Use DHCP logging on all DHCP servers or IP address management tools to update the enterprise asset inventory weekly.',
          explanation:
            'DHCP servers see every device that requests an address, which makes their logs a cheap, reliable source of truth for what is actually on the network. The MSP enables lease logging on the firewall or Windows DHCP role, retains the logs, and reviews or imports them weekly to catch devices that discovery scans missed. Many firewalls can forward DHCP events to a syslog collector to make the weekly review a report instead of a manual chore. Verify that DHCP logging is enabled, logs are retained, and the weekly reconciliation actually happens.',
          example:
            'Compliant — Windows DHCP audit logging enabled on DC01 and FortiGate lease events forwarded to syslog; weekly reconciliation report reviewed each Monday, last run 2026-06-29 with zero unmatched leases.',
          type: 'technical',
          severity: 'low',
        },
      ],
    },
    {
      code: 'CIS-2',
      title: 'Inventory and Control of Software Assets',
      description:
        'Actively manage all software on the network so that only authorized, supported software is installed and can execute.',
      controls: [
        {
          code: '2.1',
          title: 'Establish and Maintain a Software Inventory (IG1)',
          description:
            'Maintain a detailed inventory of all licensed software installed on enterprise assets, reviewed and updated at least bi-annually.',
          explanation:
            'The client needs one list of every application in use, including title, publisher, install date, and business purpose, so unsupported or unnecessary software can be spotted. MSPs get this nearly for free from the RMM: N-central collects installed-software data from every agent, which is then exported and reviewed with the client twice a year. The review should tag each title as authorized, needs-review, or remove. Verify by sampling several endpoints and confirming their installed software matches the inventory and its authorization tags.',
          example:
            'Compliant — N-central software inventory export (612 unique titles across 47 endpoints) reviewed with client IT lead on 2026-04-08; 14 titles flagged for removal, removal confirmed complete 2026-04-30.',
          type: 'administrative',
          severity: 'high',
          auto: 'ncentral',
        },
        {
          code: '2.2',
          title: 'Ensure Authorized Software is Currently Supported (IG1)',
          description:
            'Ensure that only currently supported software is designated as authorized, and document exceptions with mitigating controls.',
          explanation:
            'Software past its end-of-life stops receiving security patches and becomes a standing vulnerability, so the authorized-software list must exclude unsupported versions. During the software inventory review the MSP checks each title against vendor lifecycle dates — Windows versions, Office builds, line-of-business apps — and drives upgrades or documents a formal exception with compensating controls such as network isolation. Nodeware and patch reports usually surface EOL operating systems automatically. Verify by checking the inventory for EOL flags and confirming each exception has a documented mitigation and review date.',
          example:
            'Non-compliant — 2 Windows Server 2012 R2 hosts still in production past EOL with no documented exception; migration project opened (ticket 18422) with target completion 2026-09-30, hosts isolated to server VLAN in the interim.',
          type: 'administrative',
          severity: 'high',
        },
        {
          code: '2.3',
          title: 'Address Unauthorized Software (IG1)',
          description:
            'Ensure unauthorized software is either removed from enterprise assets or receives a documented exception, reviewed at least monthly.',
          explanation:
            'When software appears on an endpoint that is not on the authorized list, there must be a monthly process to remove it or formally approve it. MSPs implement this with RMM software-inventory alerts or a monthly report diffed against the authorized list, plus standard-user rights so most users cannot install software in the first place. Removals are pushed silently through the RMM where possible. Verify by reviewing the last three monthly reports and the tickets showing removal or exception for each flagged title.',
          example:
            'Compliant — monthly N-central unauthorized-software report reviewed 2026-06-05; 4 instances of a consumer VPN client removed via scripted uninstall, 1 exception granted for a niche CAD viewer pending procurement approval.',
          type: 'technical',
          severity: 'medium',
          auto: 'ncentral',
        },
        {
          code: '2.4',
          title: 'Utilize Automated Software Inventory Tools (IG2)',
          description:
            'Utilize software inventory tools, when possible, throughout the enterprise to automate the discovery and documentation of installed software.',
          explanation:
            'Manual software lists rot immediately; an agent-based tool that continuously reports installed applications keeps the inventory current without human effort. The RMM agent already deployed for monitoring fulfills this — N-central collects application data on every check-in — so the safeguard is really about ensuring the agent has full coverage across all managed assets. Servers, workstations, and laptops should all report; gaps usually mean a broken or missing agent. Verify by comparing agent coverage to the enterprise asset inventory and spot-checking that software data is fresh.',
          example:
            'Compliant — N-central agents on 50/50 in-scope Windows and macOS assets reporting software inventory; freshness spot-check on 2026-06-18 showed all agents checked in within 24 hours.',
          type: 'technical',
          severity: 'medium',
          auto: 'ncentral',
        },
        {
          code: '2.5',
          title: 'Allowlist Authorized Software (IG2)',
          description:
            'Use technical controls, such as application allowlisting, to ensure that only authorized software can execute or be accessed, reassessed bi-annually.',
          explanation:
            'Allowlisting flips the default from "anything runs unless blocked" to "nothing runs unless approved," which stops most commodity malware and unauthorized tools outright. For small and mid-size clients MSPs typically start with Windows Defender Application Control, AppLocker in audit-then-enforce mode, or a third-party allowlisting agent, scoped first to servers and high-risk workstations. The ruleset must be reassessed twice a year as business software changes. Verify by confirming policy deployment on in-scope machines and attempting to run an unapproved unsigned executable in a test.',
          example:
            'Partial — AppLocker enforced on all 3 servers and 12 finance workstations; remaining 35 endpoints still in audit mode. Enforcement rollout planned in two waves ending 2026-08-31.',
          type: 'technical',
          severity: 'high',
        },
        {
          code: '2.6',
          title: 'Allowlist Authorized Libraries (IG2)',
          description:
            'Use technical controls to ensure that only authorized software libraries, such as .dll and .so files, are allowed to load into a system process, reassessed bi-annually.',
          explanation:
            'Attackers frequently sideload malicious DLLs into legitimate processes, so allowlisting should extend below the executable level to libraries. In practice this means enabling the DLL rule collections in AppLocker or using Windows Defender Application Control policies that cover libraries, deployed first in audit mode to learn what legitimate applications load. Because DLL rules can be noisy, MSPs usually scope them to servers and sensitive workstations. Verify that library rules exist in the deployed policy and review audit logs for blocked or would-block events.',
          example:
            'Compliant — WDAC policy with library enforcement active on both domain controllers and the ERP application server since 2026-03-15; audit review on 2026-06-10 showed no unexpected blocks.',
          type: 'technical',
          severity: 'medium',
        },
      ],
    },
    {
      code: 'CIS-3',
      title: 'Data Protection',
      description:
        'Develop processes and technical controls to identify, classify, securely handle, retain, and dispose of data.',
      controls: [
        {
          code: '3.1',
          title: 'Establish and Maintain a Data Management Process (IG1)',
          description:
            'Establish and maintain a documented data management process addressing data sensitivity, ownership, handling, retention, and disposal, reviewed annually.',
          explanation:
            'The client needs a short written policy that says what kinds of data the business holds, who owns each kind, how it must be handled, how long it is kept, and how it is destroyed. For a small business this is typically a 2-4 page document the MSP drafts from a template and the owner signs, covering categories like customer PII, financials, and HR records. Without this document the technical controls in the rest of this control family have no requirements to enforce. Verify the document exists, is signed, names data owners, and was reviewed within the last 12 months.',
          example:
            'Compliant — Data Management Policy v2.1 signed by the practice owner 2026-02-12, covering PHI, billing, and HR data with named owners and retention periods; annual review calendared for 2027-02.',
          type: 'administrative',
          severity: 'high',
        },
        {
          code: '3.2',
          title: 'Establish and Maintain a Data Inventory (IG1)',
          description:
            'Establish and maintain a data inventory based on the data management process, reviewing sensitive data locations at least annually.',
          explanation:
            'This is a map of where sensitive data actually lives: which file shares, SharePoint sites, databases, SaaS apps, and local folders hold what categories of data. MSPs build it during onboarding by walking the file server structure, listing M365 sites and third-party SaaS apps, and interviewing the client about line-of-business systems. The inventory drives access control, encryption, and backup scoping decisions. Verify the inventory exists, minimally covers all sensitive categories from the data management policy, and was reviewed in the last year.',
          example:
            'Compliant — data inventory spreadsheet lists 6 SharePoint sites, 2 file-server shares, the PracticeSuite EHR, and QuickBooks Online with data categories and owners; last reviewed 2026-01-20 alongside the annual risk assessment.',
          type: 'administrative',
          severity: 'medium',
        },
        {
          code: '3.3',
          title: 'Configure Data Access Control Lists (IG1)',
          description:
            'Configure data access control lists based on the need to know, applying them to file systems, databases, and applications.',
          explanation:
            'Access to each data store should follow least privilege: staff get access to the folders and systems their role requires and nothing more. MSPs implement this with security groups in Active Directory or Entra ID mapped to file-share and SharePoint permissions, avoiding direct user grants and eliminating "Everyone" or "Domain Users" write access to sensitive shares. A quarterly or semi-annual permission review catches drift. Verify by sampling sensitive shares and confirming group-based ACLs match documented role requirements, with no broad-access grants on sensitive locations.',
          example:
            'Partial — HR and Finance shares locked to role groups, but the legacy Scans share grants Domain Users modify rights and contains patient documents; remediation ticket 19031 opened 2026-06-14 to restructure with a 30-day deadline.',
          type: 'technical',
          severity: 'high',
        },
        {
          code: '3.4',
          title: 'Enforce Data Retention (IG1)',
          description:
            'Retain data according to the documented data management process, enforcing both minimum and maximum retention timelines.',
          explanation:
            'Keeping data forever expands breach impact and can violate regulations, while deleting it too soon can breach legal or contractual duties, so retention must follow the written schedule. MSPs implement this with M365 retention policies and labels for mail and SharePoint, backup retention settings that match the policy, and periodic cleanup of aged file-share data. The retention schedule usually comes from the data management policy in 3.1. Verify that M365 retention policies exist and match the documented periods, and that backup retention settings agree with the schedule.',
          example:
            'Compliant — M365 retention policy holds mail 7 years and SharePoint 6 years per policy; Datto backup retention set to 1 year daily / 7 years monthly matching the schedule, verified 2026-05-22.',
          type: 'administrative',
          severity: 'medium',
          auto: 'm365',
        },
        {
          code: '3.5',
          title: 'Securely Dispose of Data (IG1)',
          description:
            'Securely dispose of data as outlined in the data management process, using disposal methods that match data sensitivity.',
          explanation:
            'Retired drives, copiers, and old laptops routinely leak data when they are resold or dumped without sanitization. The MSP builds decommissioning into its offboarding runbook: BitLocker-encrypted drives can be crypto-erased by discarding the key, other media get wiped with a verified tool, and failed drives go to a certified destruction vendor that issues certificates. Cloud data disposal means deleting content and confirming purge from retention holds. Verify by reviewing disposal records and destruction certificates for assets retired in the last year.',
          example:
            'Compliant — 6 laptops retired in Q1 2026 were BitLocker crypto-erased with tickets documenting each serial; 2 failed NAS drives destroyed by ShredSecure with certificate #C-88412 dated 2026-03-19.',
          type: 'physical',
          severity: 'medium',
        },
        {
          code: '3.6',
          title: 'Encrypt Data on End-User Devices (IG1)',
          description:
            'Encrypt data on end-user devices containing sensitive data using tools such as BitLocker or FileVault.',
          explanation:
            'A lost or stolen laptop with an unencrypted drive is a reportable data breach; full-disk encryption turns it into a hardware loss. MSPs enforce BitLocker on Windows via Intune or GPO with recovery keys escrowed to Entra ID or AD, and FileVault on Macs with keys escrowed to the MDM. The RMM reports encryption status per device so drift is visible. Verify with an encryption-status report showing all in-scope devices encrypted and recovery keys present in escrow.',
          example:
            'Compliant — BitLocker active on 44/44 Windows laptops and FileVault on 3/3 Macs per N-central report dated 2026-06-20; recovery keys verified present in Entra ID for a random sample of 10 devices.',
          type: 'technical',
          severity: 'high',
          auto: 'ncentral',
          autoCheck: 'disk_encryption',
        },
        {
          code: '3.7',
          title: 'Establish and Maintain a Data Classification Scheme (IG2)',
          description:
            'Establish and maintain an overall data classification scheme, such as Public, Internal, and Confidential, reviewed annually.',
          explanation:
            'A classification scheme gives staff a simple shared vocabulary for how sensitive a document is and therefore how it must be handled. Three or four tiers are enough for a small business — for example Public, Internal, Confidential, Restricted — each with plain handling rules. MSPs often implement the scheme with M365 sensitivity labels so classification is visible in Office apps and can drive encryption or sharing restrictions later. Verify the scheme is documented, labels exist in M365 where used, and the scheme was reviewed within the year.',
          example:
            'Compliant — three-tier scheme (Public / Internal / Confidential) documented in the data policy and published as M365 sensitivity labels on 2026-02-28; staff briefed during March all-hands.',
          type: 'administrative',
          severity: 'medium',
          auto: 'm365',
        },
        {
          code: '3.8',
          title: 'Document Data Flows (IG2)',
          description:
            'Document data flows, including flows to service providers, based on the data management process and reviewed annually.',
          explanation:
            'A data flow diagram shows how sensitive data moves: from intake forms into the LOB app, out to the payment processor, into backups, and to third parties. It does not need to be elaborate — a one-page diagram per major data category is fine — but it must include flows to external service providers since those are common breach points. MSPs typically draft it during onboarding and update it when systems change. Verify a current diagram exists covering the sensitive data categories and external providers, reviewed within 12 months.',
          example:
            'Compliant — one-page flow diagram covering patient intake, EHR, clearinghouse, and Datto cloud backup updated 2026-04-02 after the clearinghouse migration; stored in the client documentation portal.',
          type: 'administrative',
          severity: 'low',
        },
        {
          code: '3.9',
          title: 'Encrypt Data on Removable Media (IG2)',
          description:
            'Encrypt data on removable media used to store or transfer sensitive data.',
          explanation:
            'USB drives are easily lost, so any sensitive data written to removable media must be encrypted. The standard MSP implementation is BitLocker To Go enforced by Intune or GPO, which blocks writing to unencrypted removable drives, sometimes paired with device-control rules that limit which USB storage is allowed at all. Many clients simply prohibit removable media and enforce the block, which also satisfies the safeguard. Verify the policy is applied and test that an unencrypted USB stick is read-only or blocked on a managed endpoint.',
          example:
            'Compliant — Intune policy denies write access to non-BitLocker removable drives on all 47 endpoints; test on 2026-05-30 confirmed an unencrypted stick mounted read-only.',
          type: 'technical',
          severity: 'medium',
        },
        {
          code: '3.10',
          title: 'Encrypt Sensitive Data in Transit (IG2)',
          description:
            'Encrypt sensitive data in transit using protocols such as TLS or IPsec.',
          explanation:
            'Data crossing networks must be encrypted so it cannot be intercepted: HTTPS for web apps, TLS for mail flow, SMB 3 signing/encryption or VPN tunnels for file access, and IPsec or SSL VPN for site-to-site and remote traffic. MSPs enforce this by disabling legacy plaintext protocols (FTP, telnet, SMBv1, basic auth SMTP), requiring VPN for remote file access, and confirming M365 enforces TLS. Nodeware scans help spot services still offering plaintext or weak TLS. Verify with a scan report showing no plaintext management or file-transfer services and current TLS versions on exposed services.',
          example:
            'Partial — all remote access via SSL VPN and M365 TLS confirmed, but Nodeware scan 2026-06-08 found the multifunction copier offering FTP for scan-to-folder; reconfigured to SMB3 on 2026-06-12, rescan clean.',
          type: 'technical',
          severity: 'high',
        },
        {
          code: '3.11',
          title: 'Encrypt Sensitive Data at Rest (IG2)',
          description:
            'Encrypt sensitive data at rest on servers, applications, and databases containing sensitive data.',
          explanation:
            'Beyond laptops, the servers and databases that hold sensitive data in bulk need at-rest encryption so a stolen drive or improperly retired array does not expose everything. Implementation for small business servers is typically BitLocker on server volumes, storage-level encryption on the NAS, transparent database encryption where the LOB vendor supports it, and confirming SaaS providers encrypt at rest (M365 does by default). Recovery keys must be escrowed and documented. Verify volume encryption status on each in-scope server and vendor attestation for SaaS stores.',
          example:
            'Compliant — BitLocker enabled on all volumes of FS01 and SQL01 with keys escrowed in AD; Synology NAS shared-folder encryption active; M365 at-rest encryption covered by Microsoft attestation. Checked 2026-04-25.',
          type: 'technical',
          severity: 'high',
        },
        {
          code: '3.12',
          title: 'Segment Data Processing and Storage Based on Sensitivity (IG2)',
          description:
            'Segment data processing and storage based on the sensitivity of the data, keeping sensitive data off systems intended for lower-sensitivity use.',
          explanation:
            'Sensitive data should live on dedicated, better-protected systems rather than being mixed onto general-purpose shares and guest-accessible networks. Practically this means separate VLANs for servers versus user devices versus IoT and guest Wi-Fi, sensitive shares on dedicated volumes with tighter ACLs, and finance or clinical workstations separated from kiosk machines. The firewall enforces the boundaries between segments. Verify VLAN and firewall configuration shows real segmentation and that the data inventory confirms sensitive stores sit inside the protected segments.',
          example:
            'Compliant — network segmented into Server, Staff, VoIP, IoT, and Guest VLANs on the FortiGate with deny-by-default inter-VLAN rules; EHR server and finance share reside in the Server VLAN only. Reviewed 2026-03-10.',
          type: 'technical',
          severity: 'medium',
        },
      ],
    },
    {
      code: 'CIS-4',
      title: 'Secure Configuration of Enterprise Assets and Software',
      description:
        'Establish and maintain secure configurations for enterprise assets and software, replacing insecure defaults.',
      controls: [
        {
          code: '4.1',
          title: 'Establish and Maintain a Secure Configuration Process (IG1)',
          description:
            'Establish and maintain a documented secure configuration process for enterprise assets and software, reviewed annually.',
          explanation:
            'New devices and applications must be set up from a written standard rather than vendor defaults, so every build comes out hardened the same way. For an MSP this is the onboarding/build checklist: baseline image or Autopilot profile, standard security settings (BitLocker, screen lock, local admin handling), agent stack installed (N-central, Huntress), unnecessary software removed. The document should be reviewed annually and after major OS releases. Verify the checklist exists, is current, and recent device builds show evidence it was followed.',
          example:
            'Compliant — Workstation Build Standard v4 (Autopilot profile + hardening checklist) last revised 2026-01-15; 5 laptops deployed in May 2026 spot-checked and matched the standard, including BitLocker and agent stack.',
          type: 'administrative',
          severity: 'high',
        },
        {
          code: '4.2',
          title: 'Establish and Maintain a Secure Configuration Process for Network Infrastructure (IG1)',
          description:
            'Establish and maintain a documented secure configuration process for network devices, reviewed annually.',
          explanation:
            'Firewalls, switches, and wireless controllers need their own hardening standard: change default credentials, disable unused services and ports, restrict management access to admin networks, enable logging, and keep configuration backups. The MSP maintains this as a network device build standard and applies it whenever equipment is installed or replaced. Configuration exports should be stored so drift can be detected. Verify the standard exists and sample a firewall or switch config against it, checking management-access restrictions and disabled services.',
          example:
            'Compliant — Network Device Standard v2 reviewed 2026-02-01; FortiGate and both Aruba switches audited against it 2026-02-05 with management access restricted to the admin VLAN and configs backed up nightly to the MSP repository.',
          type: 'administrative',
          severity: 'high',
        },
        {
          code: '4.3',
          title: 'Configure Automatic Session Locking on Enterprise Assets (IG1)',
          description:
            'Configure automatic session locking on enterprise assets after a defined period of inactivity, not exceeding 15 minutes for general-purpose systems.',
          explanation:
            'An unlocked, unattended computer lets anyone act as the logged-in user, so screens must lock automatically — 15 minutes or less on workstations, 2 minutes or less on mobile devices. MSPs enforce this with Intune configuration profiles or GPO (interactive logon machine inactivity limit plus screensaver lock) so users cannot disable it. Exceptions such as shop-floor displays should be documented and compensated with physical controls. Verify the policy applies to all endpoints via the RMM or Intune compliance report and spot-check a machine by waiting out the timer.',
          example:
            'Compliant — Intune profile enforces a 10-minute lock on all 47 Windows endpoints and 2-minute lock on mobile; compliance report 2026-06-15 shows 47/47 applied, spot-check on the front-desk PC locked at 10:00.',
          type: 'technical',
          severity: 'medium',
          auto: 'ncentral',
          autoCheck: 'screen_lock_policy',
        },
        {
          code: '4.4',
          title: 'Implement and Manage a Firewall on Servers (IG1)',
          description:
            'Implement and manage a host-based firewall or port-filtering on servers, with a default-deny rule for unlisted services.',
          explanation:
            'Servers should not accept connections on any port that their role does not require, even from inside the LAN, because flat internal networks are how ransomware spreads. The MSP ensures Windows Defender Firewall stays enabled on every server profile with inbound default-deny and explicit allow rules for the services each server provides, managed by GPO so local changes do not persist. Verify firewall state on each server via RMM or GPO results and scan the server from an adjacent VLAN to confirm only expected ports answer.',
          example:
            'Compliant — Windows Firewall enforced by GPO on all 4 servers, inbound default-deny; Nodeware internal scan 2026-05-14 showed only expected ports (443 on APP01, 445/135 on FS01 from Staff VLAN, 1433 on SQL01 from APP01 only).',
          type: 'technical',
          severity: 'critical',
          auto: 'ncentral',
          autoCheck: 'firewall_present',
        },
        {
          code: '4.5',
          title: 'Implement and Manage a Firewall on End-User Devices (IG1)',
          description:
            'Implement and manage a host-based firewall or port-filtering agent on end-user devices, with a default-deny rule for unlisted services.',
          explanation:
            'Workstations and laptops need a host firewall active on every network profile so that a compromised peer on the LAN or a hostile coffee-shop network cannot reach services on the device. MSPs enforce Windows Defender Firewall via Intune or GPO on Domain, Private, and Public profiles, block inbound by default, and alert through the RMM if the firewall is disabled. Laptops matter most because they leave the office. Verify with an RMM firewall-status report across all endpoints and confirm users cannot disable the firewall.',
          example:
            'Compliant — N-central reports Windows Firewall active on 47/47 endpoints across all profiles as of 2026-06-20; disable attempt as a standard user blocked by policy in test.',
          type: 'technical',
          severity: 'critical',
          auto: 'ncentral',
          autoCheck: 'firewall_present',
        },
        {
          code: '4.6',
          title: 'Securely Manage Enterprise Assets and Software (IG1)',
          description:
            'Securely manage enterprise assets and software using secure protocols and infrastructure-as-code where practical, avoiding insecure management channels.',
          explanation:
            'Administration itself must happen over secure channels: HTTPS or SSH for device management instead of HTTP or telnet, RMM or Intune for configuration changes instead of ad-hoc manual tweaks, and no management interfaces exposed to the internet. For MSPs this means firewall and switch admin pages reachable only from the management VLAN or via VPN, RDP never open to the WAN, and versioned or backed-up configurations. Verify by scanning for exposed management ports externally and confirming plaintext management protocols are disabled on network gear.',
          example:
            'Compliant — external Nodeware scan 2026-06-01 shows no management ports exposed; telnet and HTTP admin disabled on all network devices, RDP reachable only through the SSL VPN with MFA.',
          type: 'technical',
          severity: 'high',
        },
        {
          code: '4.7',
          title: 'Manage Default Accounts on Enterprise Assets and Software (IG1)',
          description:
            'Manage default accounts on enterprise assets and software, such as root and administrator, by disabling them or making them unusable.',
          explanation:
            'Factory-default accounts and passwords are in every attacker playbook, so built-in admin accounts must be renamed or disabled and every default credential changed at deployment. MSPs handle this in the build standard: disable the built-in local Administrator or manage its password with Windows LAPS, change default credentials on firewalls, switches, printers, cameras, and NAS devices, and remove vendor backdoor accounts. Verify by checking LAPS coverage in the RMM, and testing a sample of network devices and printers for default logins.',
          example:
            'Partial — LAPS deployed on all 47 endpoints and built-in admin renamed, but 2 of 5 network printers still accepted default admin credentials on 2026-06-03; credentials changed same day and printer hardening added to the build checklist.',
          type: 'technical',
          severity: 'high',
        },
        {
          code: '4.8',
          title: 'Uninstall or Disable Unnecessary Services on Enterprise Assets and Software (IG2)',
          description:
            'Uninstall or disable unnecessary services on enterprise assets and software, such as unused file sharing, web server, or print services.',
          explanation:
            'Every listening service is attack surface, so anything a machine does not need — SMBv1, print spooler on servers that do not print, IIS installed by default, unused vendor agents — should be removed or disabled. The MSP bakes removals into the build standard and uses vulnerability scans to find services that crept back or were missed. Server roles should be reviewed whenever the vulnerability scanner flags an unexpected open port. Verify with an internal scan report showing only role-appropriate services listening on each asset.',
          example:
            'Compliant — SMBv1 disabled fleet-wide, print spooler disabled on all servers except PRINT01; Nodeware internal scan 2026-05-14 found one unexpected IIS instance on APP02, removed 2026-05-16 and rescan clean.',
          type: 'technical',
          severity: 'medium',
          auto: 'nodeware',
          autoCheck: 'open_ports',
        },
        {
          code: '4.9',
          title: 'Configure Trusted DNS Servers on Enterprise Assets (IG2)',
          description:
            'Configure trusted DNS servers on enterprise assets, using enterprise-controlled DNS servers or reputable external resolvers.',
          explanation:
            'Endpoints must resolve names through DNS servers the enterprise controls or trusts, because rogue DNS is a straightforward way to redirect users to malicious sites and it bypasses DNS-based filtering. MSPs point clients at internal AD DNS which forwards to a filtering service (DNSFilter, Cisco Umbrella), and block outbound port 53/853 at the firewall for everything except the internal DNS servers so devices cannot use arbitrary resolvers. Verify DHCP hands out only the approved servers and the firewall egress rule exists, then test that a manual external resolver query from a workstation fails.',
          example:
            'Compliant — DHCP issues DC01/DC02 as resolvers forwarding to DNSFilter; FortiGate blocks outbound 53/853 from all but the DCs since 2026-02-18. Workstation test query to 8.8.8.8 timed out as expected.',
          type: 'technical',
          severity: 'medium',
        },
        {
          code: '4.10',
          title: 'Enforce Automatic Device Lockout on Portable End-User Devices (IG2)',
          description:
            'Enforce automatic device lockout on portable end-user devices after a defined threshold of failed authentication attempts.',
          explanation:
            'Laptops and phones that leave the building need protection against someone guessing the PIN or password: after a set number of failed attempts (for example 10 on phones, 20 on laptops per platform guidance) the device should lock or wipe. MSPs enforce this through Intune compliance and configuration policies for both Windows and mobile platforms. This pairs with encryption from 3.6 to make a stolen device worthless. Verify the Intune policy settings and the compliance report showing enrolled portable devices in scope.',
          example:
            'Compliant — Intune policy wipes company data after 10 failed unlocks on mobile and locks Windows accounts after 10 bad attempts; 31/31 enrolled portable devices compliant as of 2026-06-22.',
          type: 'technical',
          severity: 'medium',
          auto: 'm365',
          autoCheck: 'lockout_policy',
        },
        {
          code: '4.11',
          title: 'Enforce Remote Wipe Capability on Portable End-User Devices (IG2)',
          description:
            'Remotely wipe enterprise data from enterprise-owned portable end-user devices when deemed appropriate, such as when a device is lost or stolen.',
          explanation:
            'When a laptop or phone is lost, stolen, or held by a departed employee, the MSP must be able to remotely remove company data. Intune provides remote wipe and selective retirement for enrolled devices, and the capability only works if devices are actually enrolled before they go missing, so enrollment coverage is the real control. The offboarding and lost-device runbooks should reference the wipe procedure. Verify enrollment coverage matches the portable-device inventory and review any wipe actions issued in the past year.',
          example:
            'Compliant — 31/31 portable devices Intune-enrolled; remote wipe executed on a laptop reported stolen 2026-04-11 (ticket 18877), wipe confirmed within 2 hours of report.',
          type: 'technical',
          severity: 'medium',
          auto: 'm365',
        },
      ],
    },
  ],
};
