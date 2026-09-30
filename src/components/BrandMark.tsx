/** Platform name with the uploaded logo (if any). Logo is a validated data URL from Settings. */
export default function BrandMark({
  name,
  logoDataUrl,
  className = "text-base font-semibold text-brand-800",
}: {
  name: string;
  logoDataUrl: string | null;
  className?: string;
}) {
  return (
    <span className="flex items-center gap-2">
      {logoDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoDataUrl} alt="" className="h-8 max-w-32 w-auto object-contain" />
      )}
      <span className={className}>{name}</span>
    </span>
  );
}
