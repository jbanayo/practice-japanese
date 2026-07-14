export default function Brand({ showJp = true }) {
  return (
    <span className="brand">
      PR<span className="brand-ai">A</span>CT<span className="brand-ai">I</span>CE
      {showJp && <span className="brand-jp"> 日本語</span>}
    </span>
  )
}
