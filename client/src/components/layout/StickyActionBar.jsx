export default function StickyActionBar({ children }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background shadow-md p-4 flex justify-between items-center">
      {children}
    </div>
  );
}
