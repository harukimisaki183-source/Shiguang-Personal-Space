interface AvatarVisualProps {
  value: string
  alt?: string
}

export function isImageAvatar(value: string): boolean {
  return value.startsWith('data:image/')
}

export function AvatarVisual({ value, alt = '头像' }: AvatarVisualProps) {
  if (isImageAvatar(value)) {
    return <img src={value} alt={alt} draggable={false} />
  }
  return <>{value}</>
}

interface AvatarProps {
  value: string
  className?: string
  alt?: string
}

export function Avatar({ value, className = '', alt }: AvatarProps) {
  return (
    <span className={`avatar ${className} ${isImageAvatar(value) ? 'avatar-image' : ''}`.trim()}>
      <AvatarVisual value={value} alt={alt} />
    </span>
  )
}
