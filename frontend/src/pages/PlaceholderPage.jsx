export default function PlaceholderPage({ title }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-[#FAFAFA]">{title}</h1>
      <div className="mt-8 rounded-xl border border-dashed border-[#333333] bg-[#242424] py-16 text-center text-[#A1A1AA]">
        <p className="text-sm">Cette section sera disponible prochainement.</p>
      </div>
    </div>
  );
}
