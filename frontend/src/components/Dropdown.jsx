import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

export default function Dropdown({
  value,
  onChange,
  options = [],
  placeholder = '— Сонгох —',
  disabled = false,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef(null)

  const selected = options.find(o => o.value === value)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (optValue) => {
    onChange(optValue)
    setIsOpen(false)
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(o => !o)}
        className={`input w-full flex items-center justify-between gap-2 pr-8 text-left
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${isOpen ? 'border-primary-500' : ''}`}
      >
        <span className={selected ? 'text-slate-200' : 'text-slate-500'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none
            transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown list */}
      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1
                        bg-black border border-[#252840] rounded-xl shadow-2xl
                        overflow-hidden overflow-y-auto max-h-64">
          {/* Placeholder option */}
          <div
            onClick={() => handleSelect('')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm cursor-pointer transition-colors
              ${!value
                ? 'text-primary-400 bg-primary-500/10'
                : 'text-slate-500 hover:bg-white/5'}`}
          >
            {!value && <Check size={13} className="flex-shrink-0" />}
            <span>{placeholder}</span>
          </div>

          {options.map(opt => (
            <div
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm cursor-pointer transition-colors
                ${opt.value === value
                  ? 'text-primary-400 bg-primary-500/10'
                  : 'text-slate-300 hover:bg-white/[0.08]'}`}
            >
              <Check
                size={13}
                className={`flex-shrink-0 ${opt.value === value ? 'opacity-100' : 'opacity-0'}`}
              />
              <span>{opt.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}