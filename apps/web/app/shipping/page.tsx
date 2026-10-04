export const metadata = { title: "Good things, on their way." };
export default function Page() {
  return (
    <article className="content-page">
      <p className="eyebrow">FIELDWORK / SHIPPING</p>
      <h1>Good things, on their way.</h1>
      <p style={{ fontSize: 20 }}>
        Delivery is calculated in checkout using your address and chosen
        shipping service.
      </p>
      <h2>Standard delivery</h2>
      <p>
        Standard demo delivery takes 3–5 working days. Orders over $150 qualify
        for complimentary standard delivery. Express takes 1–2 working days and
        has an additional fee. The API calculates all amounts before order
        placement.
      </p>
      <h2>Track your order</h2>
      <p>
        A private tracking token is included in your confirmation. Use Track an
        order to see order, payment and shipment events. These are local
        demonstration shipments, not real courier deliveries.
      </p>
    </article>
  );
}
