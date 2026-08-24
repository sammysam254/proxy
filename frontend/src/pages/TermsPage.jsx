import { Link } from 'react-router-dom';
import { Shield, FileText, ChevronLeft, CheckCircle2, Phone, Mail, MessageCircle } from 'lucide-react';
import Navbar from '../components/Navbar';

export default function TermsPage({ session }) {
  const terms = [
    {
      title: "1. Acceptance of Terms",
      desc: "By accessing, purchasing, or using Vertext Proxies ('Service', 'we', 'our'), you agree to be bound by these Terms of Service. If you do not agree to all terms and conditions, you must not access or use our proxy infrastructure."
    },
    {
      title: "2. Description of Services",
      desc: "Vertext Proxies provides access to genuine residential Wi-Fi and 4G/5G mobile proxy network routes. Proxies are routed through legitimate carrier SIM and ISP hardware nodes designed for legitimate automation, market research, and web access."
    },
    {
      title: "3. User Eligibility & Account Security",
      desc: "You must be at least 18 years of age or the legal age of majority in your jurisdiction to create an account. You are solely responsible for maintaining the confidentiality of your proxy authentication credentials (username and password)."
    },
    {
      title: "4. Strictly Prohibited Activities",
      desc: "Users are strictly forbidden from utilizing Vertext Proxies for any illegal activity, including but not limited to: distributed denial-of-service (DDoS) attacks, brute-force hacking, unauthorized access to computer systems, spamming, financial fraud, phishing, carding, or malware distribution."
    },
    {
      title: "5. Zero Tolerance Anti-Abuse Policy",
      desc: "Any detected attempts to conduct malicious cyber activities, credential stuffing, or illicit traffic will result in immediate termination of the offending account without notice, forfeiture of all remaining credits, and permanent IP blacklisting."
    },
    {
      title: "6. Bandwidth Allocation & Real-Time Accounting",
      desc: "Bandwidth usage is calculated based on exact data transferred (upload and download combined). When an account reaches its allocated GB limit, proxy access will automatically suspend until the subscription is renewed or topped up."
    },
    {
      title: "7. Fair Use & Concurrency Guidelines",
      desc: "Users agree to operate within reasonable socket and concurrency boundaries. Intentional resource exhaustion, abusive connection loops, or overloading proxy gateways may result in temporary socket throttling to protect network integrity."
    },
    {
      title: "8. Billing, Payments & Auto-Renewal",
      desc: "All services are billed in advance on a subscription or pay-per-bundle basis. You agree to provide accurate and complete payment information. Subscriptions renew automatically unless cancelled before the end of the current billing cycle."
    },
    {
      title: "9. Refund & Cancellation Policy",
      desc: "Due to the digital and consumable nature of bandwidth and dedicated IP slot allocation, all sales are generally non-refundable once data has been transmitted. If a hardware slot experiences verifiable technical downtime exceeding 24 hours, replacement time or store credit will be credited."
    },
    {
      title: "10. Service Level Agreement (SLA) & Uptime",
      desc: "Vertext Proxies strives to maintain a 99.9% network availability target. However, scheduled maintenance, emergency upstream ISP carrier maintenance, or force majeure events may occasionally affect connectivity."
    },
    {
      title: "11. Mobile Carrier & ISP Dynamic Reassignment",
      desc: "Mobile carrier networks (e.g., Safaricom, Airtel, Comcast) periodically perform automated IP reallocations. IP rotation or tower reassignment is an inherent characteristic of genuine cellular and residential networks."
    },
    {
      title: "12. IP Rotation Mechanism",
      desc: "Instant IP rotation is available on designated mobile proxy plans via dashboard triggers or rotating API endpoints. Users must adhere to rate limits between consecutive rotation requests (minimum 30 seconds interval)."
    },
    {
      title: "13. Intellectual Property Rights",
      desc: "All software, website assets, documentation, APIs, trademarks, and logos associated with Vertext Proxies are the exclusive property of Vertext Proxies. You are granted a limited, revocable, non-exclusive license to use the proxy services solely for lawful purposes."
    },
    {
      title: "14. Third-Party Websites & Services",
      desc: "We do not control and are not responsible for the availability, content, privacy practices, or policies of third-party target websites accessed through our proxy tunnels."
    },
    {
      title: "15. Limitation of Liability",
      desc: "To the maximum extent permitted by law, Vertext Proxies shall not be liable for any direct, indirect, incidental, special, consequential, or punitive damages arising from the use or inability to use the service."
    },
    {
      title: "16. Disclaimer of Warranties",
      desc: "The services are provided on an 'AS IS' and 'AS AVAILABLE' basis without warranties of any kind, either express or implied, including warranties of merchantability, fitness for a particular purpose, or non-infringement."
    },
    {
      title: "17. Indemnification",
      desc: "You agree to defend, indemnify, and hold harmless Vertext Proxies, its operators, officers, and affiliates against any claims, liabilities, damages, and expenses resulting from your breach of these Terms or misuse of the proxy network."
    },
    {
      title: "18. Account Suspension & Termination",
      desc: "We reserve the right to suspend, restrict, or terminate any account immediately if we reasonably suspect a breach of these Terms, non-payment, or threat to the security and reputation of the proxy network."
    },
    {
      title: "19. Modifications to the Terms",
      desc: "We reserve the right to revise these Terms of Service at any time. Continued use of the service following the posting of updated Terms constitutes your binding acceptance of the changes."
    },
    {
      title: "20. Governing Law & Dispute Resolution",
      desc: "These Terms shall be governed by and construed in accordance with applicable commercial laws. Any dispute arising out of or related to these Terms shall first be attempted to be resolved through amicable direct negotiation."
    }
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--clr-bg)', color: 'var(--clr-text)' }}>
      <Navbar session={session} />

      <main className="container" style={{ padding: '60px 20px 100px', maxWidth: '960px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '40px' }}>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#3b82f6', textDecoration: 'none', fontSize: '0.9rem', marginBottom: '20px', fontWeight: 600 }}>
            <ChevronLeft size={16} /> Back to Store
          </Link>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '20px', color: '#3b82f6', fontSize: '0.85rem', fontWeight: 600, marginBottom: '16px' }}>
            <FileText size={14} /> Legal Documentation
          </div>
          <h1 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, margin: '0 0 12px' }}>
            Terms of Service
          </h1>
          <p style={{ color: 'var(--clr-text-2)', fontSize: '1.05rem', lineHeight: 1.6 }}>
            Last Updated: August 2026. Please read these 20 comprehensive clauses carefully before using the Vertext Proxies network.
          </p>
        </div>

        {/* 20 Terms Clauses Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {terms.map((item, idx) => (
            <div key={idx} className="card" style={{ padding: '24px', background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: '12px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 8px', color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={18} color="#3b82f6" />
                {item.title}
              </h3>
              <p style={{ color: 'var(--clr-text-2)', fontSize: '0.925rem', lineHeight: 1.7, margin: 0 }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Contact Assistance Box */}
        <div style={{ marginTop: '50px', padding: '30px', background: 'var(--clr-surface-2)', border: '1px solid var(--clr-border)', borderRadius: '16px', textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '1.2rem', fontWeight: 700 }}>Questions About Our Terms?</h3>
          <p style={{ color: 'var(--clr-text-2)', fontSize: '0.9rem', marginBottom: '20px' }}>
            Our support and compliance team is available 24/7 to assist with legal or enterprise licensing inquiries.
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
