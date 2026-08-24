import { Link } from 'react-router-dom';
import { ShieldCheck, Lock, ChevronLeft, CheckCircle2, Phone, Mail, MessageCircle } from 'lucide-react';
import Navbar from '../components/Navbar';

export default function PrivacyPage({ session }) {
  const privacyClauses = [
    {
      title: "1. Strict Zero-Log Browsing Policy",
      desc: "Vertext Proxies adheres to a strict Zero-Log policy regarding your online browsing activities. We do not inspect, intercept, store, or monitor the contents of the URLs, payload data, HTTP headers, or queries transmitted through your encrypted proxy tunnels."
    },
    {
      title: "2. Information We Collect",
      desc: "We only collect minimal operational information required to provide the service: your registered email address, hashed account authentication credentials, and encrypted billing transaction references."
    },
    {
      title: "3. Bandwidth & Usage Accounting",
      desc: "To manage your data plan and prevent service overages, our system measures raw byte counters (total megabytes uploaded and downloaded) per proxy username. This data is used solely for quota accounting and billing enforcement."
    },
    {
      title: "4. Proxy Authentication Credentials",
      desc: "Proxy usernames and passwords created in your account dashboard are stored securely and utilized strictly for authenticating your SOCKS5, HTTP, and HTTPS connection requests to the proxy gateway."
    },
    {
      title: "5. Real-Time End-to-End Encryption",
      desc: "All HTTPS and TLS-based connections passing through our proxy network utilize standard end-to-end TLS encryption. Your target server communications remain strictly encrypted and unreadable by intermediate proxy nodes."
    },
    {
      title: "6. Payment & Financial Data Security",
      desc: "Vertext Proxies does not store full credit card numbers or sensitive banking credentials on our servers. All financial transactions are processed securely through trusted, PCI-DSS compliant payment gateways."
    },
    {
      title: "7. Use of Essential Cookies",
      desc: "Our web dashboard uses only essential session cookies and local storage tokens necessary to keep you authenticated, maintain user preferences, and secure your client dashboard sessions."
    },
    {
      title: "8. No Sale or Monetization of Personal Data",
      desc: "We never sell, rent, trade, or monetize your personal information or usage statistics to third-party advertisers, data brokers, or marketing networks under any circumstances."
    },
    {
      title: "9. Account Information Protection",
      desc: "We implement industry-standard security measures, including salted bcrypt password hashing, SSL/TLS transport encryption, and multi-layered database firewall rules to protect your personal account records."
    },
    {
      title: "10. Automated Inactive Session Cleanup",
      desc: "Stale session tokens and temporary memory caches are routinely wiped to ensure maximum privacy and prevent unauthorized session hijacking."
    },
    {
      title: "11. Diagnostic Logs & Operational Telemetry",
      desc: "Temporary diagnostic telemetry (such as connection success/failure codes and hardware health status) may be kept in volatile system memory for troubleshooting and is automatically discarded within 48 hours."
    },
    {
      title: "12. IP Address Anonymity",
      desc: "When connected through our residential or mobile nodes, target web servers only see the public IP address of the carrier hardware SIM or Wi-Fi node, keeping your original client IP address completely concealed."
    },
    {
      title: "13. Sub-Processor & Hosting Infrastructure",
      desc: "Our web platform and proxy routing gateways are hosted on secure, audited cloud data centers with strict role-based access control and encrypted database storage."
    },
    {
      title: "14. Compliance with Legal Obligations",
      desc: "We may disclose minimal required account information only if mandated by a valid, legally enforceable court order from a competent jurisdiction, in accordance with applicable data protection laws."
    },
    {
      title: "15. User Rights: Access & Data Portability",
      desc: "You have the right to request a copy of the personal information stored in your account profile and view your historical subscription records at any time via your dashboard."
    },
    {
      title: "16. User Rights: Rectification & Correction",
      desc: "You may update, correct, or amend your profile details and contact email directly through your account settings or by contacting our support team."
    },
    {
      title: "17. Right to Erasure ('Right to be Forgotten')",
      desc: "Upon termination of your subscription, you may request the complete deletion of your account, authentication credentials, and associated records from our active databases."
    },
    {
      title: "18. Children's Online Privacy Protection",
      desc: "Our services are exclusively intended for business professionals and adults. We do not knowingly collect personal data from individuals under 18 years of age."
    },
    {
      title: "19. Policy Updates & Notifications",
      desc: "We may update this Privacy Policy periodically to reflect technological advancements or regulatory requirements. Any material changes will be announced on our website with an updated revision date."
    },
    {
      title: "20. Data Protection Officer & Privacy Contacts",
      desc: "If you have any questions, concerns, or data requests regarding this Privacy Policy, you can reach out directly to our Data Protection team via email, phone, or WhatsApp."
    }
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--clr-bg)', color: 'var(--clr-text)' }}>
      <Navbar session={session} />

      <main className="container" style={{ padding: '60px 20px 100px', maxWidth: '960px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '40px' }}>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#10b981', textDecoration: 'none', fontSize: '0.9rem', marginBottom: '20px', fontWeight: 600 }}>
            <ChevronLeft size={16} /> Back to Store
          </Link>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '20px', color: '#10b981', fontSize: '0.85rem', fontWeight: 600, marginBottom: '16px' }}>
            <ShieldCheck size={14} /> Privacy & Zero-Log Protection
          </div>
          <h1 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, margin: '0 0 12px' }}>
            Privacy Policy
          </h1>
          <p style={{ color: 'var(--clr-text-2)', fontSize: '1.05rem', lineHeight: 1.6 }}>
            Last Updated: August 2026. Your privacy and anonymity are fundamental to our architecture. Below are our 20 privacy commitments.
          </p>
        </div>

        {/* 20 Privacy Clauses Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {privacyClauses.map((item, idx) => (
            <div key={idx} className="card" style={{ padding: '24px', background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: '12px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 8px', color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={18} color="#10b981" />
                {item.title}
              </h3>
              <p style={{ color: 'var(--clr-text-2)', fontSize: '0.925rem', lineHeight: 1.7, margin: 0 }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Privacy Assistance Box */}
        <div style={{ marginTop: '50px', padding: '30px', background: 'var(--clr-surface-2)', border: '1px solid var(--clr-border)', borderRadius: '16px', textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '1.2rem', fontWeight: 700 }}>Data Privacy & Compliance Inquiries</h3>
          <p style={{ color: 'var(--clr-text-2)', fontSize: '0.9rem', marginBottom: '20px' }}>
            Contact our dedicated privacy and security team directly for data access or erasure requests.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '16px' }}>
            <a href="tel:+254706499848" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
              <Phone size={15} /> +254 706 499 848
            </a>
            <a href="https://wa.me/254706499848" target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none', color: '#25D366' }}>
              <MessageCircle size={15} /> WhatsApp Support
            </a>
            <a href="mailto:sammyseth260@gmail.com" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
              <Mail size={15} /> sammyseth260@gmail.com
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
