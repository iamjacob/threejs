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
    label: "Particles",
  },
  {
    id: "PerlinNoise",
    label: "Perlin Noise",
  },
  {
    id: "Blur",
    label: "Blur",
  }
];

// Book,      
// Open Book,
// Shelf + levels,
// Particles,
// Perlin Noise, 

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
        className="group relative flex w-full items-start py-2 pr-3 text-left transition-colors"
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
              ? "font-medium text-black"
              : "text-stone-500 group-hover:text-stone-800"
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
  const [collapsed, setCollapsed] = useState<boolean>(false);

  return (
    <div className="flex absolute items-start justify-cente p-8 z-100 backdrop-blur-xl rounded-lg shadow-lg border border-stone-200 transition-all duration-200">
      <div className="flex items-start">
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          aria-label={
            collapsed ? "Expand navigation" : "Collapse navigation"
          }
          aria-expanded={!collapsed}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-l-md border border-r-0 border-stone-100 bg-stone-100 text-stone-500 transition-colors hover:text-stone-900"
        >
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`transition-transform duration-200 ${
              collapsed ? "-rotate-90" : "rotate-0"
            }`}
          />
        </button>

        <div
          className={`overflow-hidden border-stone-800 transition-[width,opacity] duration-200 ${
            collapsed ? "w-0 opacity-0" : "w-[280px] opacity-100"
          }`}
        >
          <div className="w-[280px] pl-6 pt-1">
            <h2 className="mb-4 text-[22px] font-bold leading-tight text-stone-800">
              {title}
            </h2>

            <nav aria-label={title}>
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
    </div>
  );
}