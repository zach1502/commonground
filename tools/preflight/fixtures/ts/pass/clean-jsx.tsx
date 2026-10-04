/** Pass fixture: copy comes in as props; only punctuation, numbers and units are literal. */
export function TreeCard(props: { readonly alt: string; readonly caption: string }) {
  return (
    <figure>
      <img alt={props.alt} src="/maple.png" />
      <figcaption>
        {props.caption} · 0.5 m
      </figcaption>
    </figure>
  );
}
