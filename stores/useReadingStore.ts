"use client";

import { create } from "zustand";

interface GoToPageOptions {
  open?: boolean;
}

export interface ReadingState {
  selectedPage: number;
  currentPage: number;
  bookOpen: boolean;
  setSelectedPage: (page: number) => void;
  setCurrentPage: (page: number) => void;
  openBook: () => void;
  closeBook: () => void;
  goToPage: (page: number, options?: GoToPageOptions) => void;
}

export const useReadingStore = create<ReadingState>()((set) => ({
  selectedPage: 0,
  currentPage: 0,
  bookOpen: false,

  setSelectedPage: (page) => set({ selectedPage: page }),
  setCurrentPage: (page) => set({ currentPage: page }),
  openBook: () => set({ bookOpen: true }),
  closeBook: () => set({ bookOpen: false }),

  goToPage: (page, { open = true } = {}) => {
    set({
      selectedPage: page,
      ...(open ? { bookOpen: true } : {}),
    });
  },
}));
