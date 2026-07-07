export default function FormSection({ title, children }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
      {children}
    </div>
  );
}
