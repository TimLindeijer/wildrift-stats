import type { ReactNode } from 'react'
import type { SortState } from '../lib/sort.ts'

interface SortHeaderProps<K extends string> {
  column: K
  sort: SortState<K>
  onSort: (column: K) => void
  className?: string
  children: ReactNode
}

export function SortHeader<K extends string>({ column, sort, onSort, className, children }: SortHeaderProps<K>) {
  const active = sort.key === column
  return (
    <th
      scope="col"
      className={className}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <button type="button" className="sort-button" onClick={() => onSort(column)}>
        {children}
        <span className="sort-button__arrow" aria-hidden="true">
          {active ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
        </span>
      </button>
    </th>
  )
}
