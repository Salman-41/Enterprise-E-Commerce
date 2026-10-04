import { Contact } from "@/components/contact";
export const metadata = { title: "Contact" };
export default function Page() {
  return (
    <div className="content-page">
      <p className="eyebrow">ALWAYS A CONVERSATION</p>
      <h1>Let’s talk.</h1>
      <p>
        Questions about an object, an order, or the way we work? Leave us a
        note.
      </p>
      <Contact />
    </div>
  );
}
