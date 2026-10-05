import { useState } from 'react'

function initials(name: string): string {
  const words = name.split(/[\s&.'-]+/).filter(Boolean)
  if (words.length >= 2) return `${words[0]![0]}${words[1]![0]}`
  return name.slice(0, 2)
}

interface ChampionIconProps {
  src: string | null | undefined
  name: string
  size?: number
}

/** Decorative champion portrait (the name is always shown next to it). Falls back to initials. */
export function ChampionIcon({ src, name, size = 32 }: ChampionIconProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (!src || failedSrc === src) {
    return (
      <span className="champ-icon champ-icon--fallback" style={{ width: size, height: size }} aria-hidden="true">
        {initials(name)}
      </span>
    )
  }
  return (
    <img
      className="champ-icon"
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
    />
  )
}
