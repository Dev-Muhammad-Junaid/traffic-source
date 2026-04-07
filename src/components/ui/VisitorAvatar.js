export default function VisitorAvatar({ visitorId, size = 36 }) {
  const seed = visitorId || 'unknown';
  const src = `https://api.dicebear.com/9.x/micah/svg?seed=${encodeURIComponent(seed)}&size=${size}&backgroundType=gradientLinear&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="visitor-avatar"
    />
  );
}
