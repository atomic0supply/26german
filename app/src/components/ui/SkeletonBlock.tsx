interface SkeletonBlockProps {
  lines?: number;
}

export const SkeletonBlock = ({ lines = 3 }: SkeletonBlockProps) => (
  <div className="skeleton-block" aria-hidden="true">
    {Array.from({ length: lines }, (_, index) => (
      <span key={index} className="skeleton-block__line" />
    ))}
  </div>
);
