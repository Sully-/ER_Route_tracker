import { Link } from 'react-router-dom';
import './PrivacyPage.css';

export default function PrivacyPage() {
  return (
    <div className="privacy-page">
      <div className="privacy-container">
        <header className="privacy-header">
          <Link to="/" className="back-link">← Back to Map</Link>
          <h1>Privacy Policy & Terms of Use</h1>
          <p className="last-updated">Last updated: January 2026</p>
        </header>

        <section className="privacy-section">
          <h2>Introduction</h2>
          <p>
            Elden Ring Route Tracker ("we", "our", or "the application") respects your privacy. 
            This policy explains what data we collect, how we use it, and your rights regarding your information.
          </p>
        </section>

        <section className="privacy-section">
          <h2>Data We Collect</h2>
          <p>When you sign in using an OAuth provider (Discord, Twitch, or Google), we collect:</p>
          <ul>
            <li><strong>Username/Display Name</strong> - to identify you in the application</li>
            <li><strong>Email Address</strong> - for account identification (if provided by the OAuth provider)</li>
            <li><strong>Profile Picture</strong> - to personalize your experience</li>
            <li><strong>OAuth Provider ID</strong> - to link your account securely</li>
          </ul>
          <p>
            We also store the route tracking keys you create or add to your account.
          </p>
        </section>

        <section className="privacy-section">
          <h2>How We Use Your Data</h2>
          <p>Your data is used exclusively to:</p>
          <ul>
            <li>Authenticate you and maintain your session</li>
            <li>Display your profile information within the application</li>
            <li>Link your route tracking keys to your account</li>
            <li>Allow you to connect multiple OAuth providers to one account</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>Data Sharing</h2>
          <p>
            <strong>We do not sell, rent, or share your personal data with third parties.</strong>
          </p>
          <p>
            Your data is only used within this application for the purposes described above.
          </p>
        </section>

        <section className="privacy-section">
          <h2>Data Storage & Security</h2>
          <p>
            Your data is stored securely in our database. We use industry-standard security 
            measures including encrypted connections (HTTPS) and secure authentication tokens (JWT).
          </p>
          <p>
            OAuth authentication is handled by the respective providers (Discord, Twitch, Google). 
            We never see or store your passwords.
          </p>
        </section>

        <section className="privacy-section">
          <h2>Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li><strong>Access</strong> - View all data associated with your account</li>
            <li><strong>Deletion</strong> - Request deletion of your account and all associated data</li>
            <li><strong>Unlinking</strong> - Remove any linked OAuth provider from your account</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>Cookies</h2>
          <p>
            We use essential cookies only for authentication purposes (session management). 
            We do not use tracking cookies or third-party analytics.
          </p>
        </section>

        <section className="privacy-section">
          <h2>Contact</h2>
          <p>
            For any questions about this privacy policy or to request data deletion, 
            please contact us through the project repository or Discord.
          </p>
        </section>

        <section className="privacy-section">
          <h2>Terms of Use</h2>
          <p>By using Elden Ring Route Tracker, you agree to the following terms:</p>
          <ul>
            <li><strong>Personal Use</strong> - This application is provided for personal, non-commercial use</li>
            <li><strong>Fair Use</strong> - Do not abuse the service (excessive API calls, spam, etc.)</li>
            <li><strong>No Warranty</strong> - The service is provided "as is" without warranty of any kind</li>
            <li><strong>Account Responsibility</strong> - You are responsible for maintaining the security of your account</li>
            <li><strong>Content</strong> - Route data you share may be visible to others who have your view key</li>
          </ul>
          <p>
            We reserve the right to terminate accounts that violate these terms or abuse the service.
          </p>
        </section>

        <footer className="privacy-footer">
          <Link to="/" className="back-link">← Back to Map</Link>
        </footer>
      </div>
    </div>
  );
}
