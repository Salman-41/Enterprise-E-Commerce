export const metadata = { title: "A few useful details." };
export default function Page() {
  return (
    <article className="content-page">
      <p className="eyebrow">FIELDWORK / TERMS</p>
      <h1>A few useful details.</h1>
      <p style={{ fontSize: 20 }}>
        Please understand how this demonstration store works before placing an
        order.
      </p>
      <h2>Demonstration transactions</h2>
      <p>
        All products and commerce activity are fictional seed data. Mock
        checkout records a real local database order but does not charge a card
        or dispatch physical goods. Pricing, delivery and taxes are
        deterministic examples.
      </p>
      <h2>Using your account</h2>
      <p>
        Keep your credentials private. Administrative demo credentials are
        provided only for local evaluation. Production operators must configure
        secure credentials, appropriate consumer terms, payment integrations and
        delivery agreements before commercial use.
      </p>
    </article>
  );
}
