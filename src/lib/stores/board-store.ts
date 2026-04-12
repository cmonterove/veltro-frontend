import { create } from 'zustand'

type BoardState = {
  activeBoardId: string | null
  setActiveBoardId: (id: string | null) => void
}

export const useBoardStore = create<BoardState>((set) => ({
  activeBoardId: null,
  setActiveBoardId: (id) => set({ activeBoardId: id }),
}))
