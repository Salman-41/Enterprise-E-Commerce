export const metadata = { title: "A little clarity." };
export default function Page() {
  return (
    <article className="content-page">
      <p className="eyebrow">FIELDWORK / FAQ</p>
      <h1>A little clarity.</h1>
      <p style={{ fontSize: 20 }}>The everyday questions, answered.</p>
      <h2>Is this a real retailer?</h2>
      <p>
        No. This is a functioning portfolio commerce platform with seeded
        fictional merchandise and a mock payment provider. You can test
        browsing, account creation, carts, checkout and operations without
        spending money.
      </p>
      <h2>Can I test a failed payment?</h2>
      <p>
        Yes. Choose the declined mock payment in checkout. The order
        confirmation explains the failure and lets you retry. For returns, sign
        in and open an eligible order. For source and setup details, visit the
        GitHub repository.
      </p>
    </article>
  );
}
