export const metadata = { title: "Your details, considered." };
export default function Page() {
  return (
    <article className="content-page">
      <p className="eyebrow">FIELDWORK / PRIVACY</p>
      <h1>Your details, considered.</h1>
      <p style={{ fontSize: 20 }}>
        We collect only information needed to run the store and your account.
      </p>
      <h2>What we store</h2>
      <p>
        Account name, email, hashed password, addresses, order history and
        preferences are stored in the local development database. Session
        cookies are HTTP-only. We do not ask for actual payment card details in
        the mock checkout.
      </p>
      <h2>Your choices</h2>
      <p>
        Update your profile and communication preferences in your account. Sign
        out on all devices from Security. This portfolio demonstration is not a
        deployed commercial service; operators must provide
        jurisdiction-specific privacy terms before launch.
      </p>
    </article>
  );
}
