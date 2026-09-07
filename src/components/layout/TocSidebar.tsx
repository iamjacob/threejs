import { useState } from "react";
import { ChevronDown } from "lucide-react";

export type TocItem = {
  id: string;
  label: string;
  children?: TocItem[];
};

type NodeProps = {
  item: TocItem;
  depth: number;
  activeId: string;
  onSelect: (id: string) => void;
};

type TocSidebarProps = {
  items?: TocItem[];
  title?: string;
  defaultActiveId?: string;
};

const DEFAULT_ITEMS: TocItem[] = [
  { id: "Boooks", label: "Boooks R3F!" },
  {
    id: "3DBook",
    label: "3D Book",
  },
  {
    id: "OpenBook",
    label: "Open Book",
    children: [
      { id: "page-folding", label: "Page folding" },
      { id: "page-zoom-in", label: "Page zoom in" },
      { id: "book-reader", label: "Book reader w/Foliate.js" },
    ],
  },
  {
    id: "Shelflevels",
    label: "Shelf + levels",
    children: [
      { id: "level-based-shelf", label: "Shelves growing with levels" },
      { id: "level-four-shelves", label: "Level 4 Shelves" },
      { id: "level-top-shelves", label: "Top level is 360degrees" },
    ],
  },
  {
    id: "Particles",
    label: "Add book - Particles",
  },
  {
    id: "PerlinNoise",
    label: "Delete book - Dissolve - Perlin Noise",
  },
  {
    id: "Blur",
    label: "Blur",
  }
];

function Node({
  item,
  depth,
  activeId,
  onSelect,
}: NodeProps) {
  const isActive = item.id === activeId;
  const hasChildren = Boolean(item.children?.length);

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        className="group relative flex w-full items-start my-1 py-1 pr-3 text-left cursor-pointer transition-colors"
        style={{ paddingLeft: 16 + depth * 16 }}
      >
        {isActive && (
          <span
            aria-hidden="true"
            className="absolute bottom-1 left-0 top-1 w-[2px] bg-[#d91b24]"
          />
        )}

        <span
          className={`text-[15px] leading-snug transition-colors ${
            isActive
              ? "font-medium text-stone-100"
              : "text-stone-500 group-hover:text-stone-300"
          }`}
        >
          {item.label}
        </span>
      </button>

      {hasChildren && (
        <div>
          {item.children?.map((child) => (
            <Node
              key={child.id}
              item={child}
              depth={depth + 1}
              activeId={activeId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TocSidebar({
  items = DEFAULT_ITEMS,
  title = "Components",
  defaultActiveId = "impatient",
}: TocSidebarProps) {
  const [activeId, setActiveId] = useState<string>(defaultActiveId);
  const [collapsed, setCollapsed] = useState<boolean>(true);

  return (
    <div className="fixed right-0 top-20 z-50 flex items-start">
      <button
        type="button"
        onClick={() => setCollapsed((current) => !current)}
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        aria-expanded={!collapsed}
        className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-l-md border-r-0 bg-white/[0.08] backdrop-blur-xl text-stone-500 shadow-lg transition-colors hover:text-stone-900"
      >
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`transition-transform duration-200 size-6 text-[#d91b24] ${
            collapsed ? "rotate-90" : "-rotate-90"
          }`}
        />
      </button>

      <div
        className={`overflow-hidden rounded-bl-lg bg-white/[0.08] backdrop-blur-xl transition-[width,opacity] duration-200 ${
          collapsed ? "w-0 opacity-0" : "w-[280px] opacity-100"
        }`}
      >
        <div className="w-[280px] pl-6 pt-1">
          <h2 className="mb-1 text-[22px] pt-2 leading-tight text-stone-100">
            {title}
          </h2>

          <nav aria-label={title} >
            {items.map((item) => (
              <Node
                key={item.id}
                item={item}
                depth={0}
                activeId={activeId}
                onSelect={setActiveId}
              />
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}