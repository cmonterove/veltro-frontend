'use client'

import { createContext, useContext } from 'react'
import { DEFAULT_BRAND, type Brand } from '@/lib/brand'

/**
 * El color de la cuenta en uso (lib/brand). `preview` lo muestra al instante mientras se elige, antes de
 * guardarlo (null vuelve al de la cuenta); lo aplica el armazón (data-brand en la app y en <html>).
 */
export const BrandContext = createContext<{ brand: Brand; preview: (b: Brand | null) => void }>({ brand: DEFAULT_BRAND, preview: () => {} })
export const useBrand = () => useContext(BrandContext)
