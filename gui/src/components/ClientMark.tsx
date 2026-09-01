/**
 * One brand mark, one decision about how to paint it.
 *
 * The rule this centralizes is the one that was already got wrong once: a
 * single-ink logo drawn as an <img> is invisible against one of the two themes,
 * so it has to be drawn as a CSS mask tinted with the surrounding text color
 * instead. That decision was inline in ClientConfigRow, which was fine while
 * exactly one surface drew marks. Four surfaces do now, and four copies of a
 * ternary whose wrong branch renders nothing at all is how the bug comes back.
 *
 * Marks are decorative here. Every call site puts one beside a text label that
 * already names the client, so the mark contributes nothing to the accessible
 * name and must not try: an <img alt={label}> next to a visible label makes a
 * screen reader say it twice.
 */
import { MASKED_MARKS } from "./integration-marks";

export default function ClientMark({
  src,
  label,
  size = 20,
  className,
}: {
  /** Asset path, or null for a client with no committed mark. */
  src: string | null;
  /** Only the first character is drawn, as the monogram fallback. */
  label: string;
  size?: number;
  className?: string;
}) {
  const classes = className ? `client-mark ${className}` : "client-mark";
  // Concatenated rather than interpolated: the i18n lint reads a template
  // literal with a bare unit as user-facing copy, and a CSS length is not that.
  const style = { "--client-mark-size": String(size) + "px" } as React.CSSProperties;
  if (!src) {
    return (
      <span className={`${classes} client-mark--monogram`} style={style} aria-hidden="true">
        {label.slice(0, 1)}
      </span>
    );
  }
  if (MASKED_MARKS.has(src)) {
    return (
      <span
        className={`${classes} client-mark--mask`}
        style={{ ...style, maskImage: `url(${src})`, WebkitMaskImage: `url(${src})` }}
        aria-hidden="true"
      />
    );
  }
  return (
    <span className={`${classes} client-mark--img`} style={style} aria-hidden="true">
      <img src={src} alt="" width={size} height={size} />
    </span>
  );
}
