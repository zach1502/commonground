/** Fail fixture: literal UI text in a child and in an alt prop. */
export function TreeCard() {
  return (
    <figure>
      <img alt="A red maple" src="/maple.png" />
      <figcaption>Tree canopy</figcaption>
    </figure>
  );
}
