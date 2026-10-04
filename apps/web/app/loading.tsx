export default function Loading() {
  return (
    <div className="section" aria-label="Loading store">
      <div className="skeleton" style={{ height: 80, width: "50%" }} />
      <div className="product-grid">
        {[1, 2, 3, 4].map((n) => (
          <div className="skeleton" key={n} style={{ height: 350 }} />
        ))}
      </div>
    </div>
  );
}
