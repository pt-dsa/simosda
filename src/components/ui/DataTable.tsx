import React, { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { cn } from "@/lib/utils";

export interface ColumnDef<T> {
  header: string;
  accessorKey?: keyof T | string;
  cell?: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  searchQuery?: string;
  itemsPerPageOptions?: number[];
  defaultItemsPerPage?: number;
  renderMobileCard?: (row: T, isSelected?: boolean, onToggle?: () => void) => React.ReactNode;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  selectedItems?: T[];
  onSelectionChange?: (items: T[]) => void;
  getId?: (row: T) => string;
}

export function DataTable<T>({
  data,
  columns,
  searchQuery = "",
  itemsPerPageOptions = [10, 25, 50, 100],
  defaultItemsPerPage = 10,
  renderMobileCard,
  onRowClick,
  selectable = false,
  selectedItems = [],
  onSelectionChange,
  getId = (row: any) => row.id || row.asset_id || JSON.stringify(row),
}: DataTableProps<T>) {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(defaultItemsPerPage);

  // Sorting
  const requestSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  // Searching & Sorting
  const processedData = useMemo(() => {
    let filtered = [...data];

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      filtered = filtered.filter((row: any) => {
        return Object.values(row).some((val) => 
          val && String(val).toLowerCase().includes(lowerQuery)
        );
      });
    }

    if (sortConfig !== null) {
      filtered.sort((a: any, b: any) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue === undefined || aValue === null) return 1;
        if (bValue === undefined || bValue === null) return -1;

        if (aValue < bValue) {
          return sortConfig.direction === "asc" ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === "asc" ? 1 : -1;
        }
        return 0;
      });
    }

    return filtered;
  }, [data, searchQuery, sortConfig]);

  // Pagination
  const totalItems = processedData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  
  // Reset to first page if page is out of bounds due to search/filter
  React.useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [totalPages, currentPage]);

  const currentData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return processedData.slice(start, start + itemsPerPage);
  }, [processedData, currentPage, itemsPerPage]);

  const toggleRow = (row: T) => {
    if (!onSelectionChange) return;
    const isSelected = selectedItems.some(i => getId(i) === getId(row));
    if (isSelected) {
      onSelectionChange(selectedItems.filter(i => getId(i) !== getId(row)));
    } else {
      onSelectionChange([...selectedItems, row]);
    }
  };

  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (selectedItems.length === currentData.length && currentData.length > 0) {
      // If all current page items are selected, unselect them all
      const currentIds = new Set(currentData.map(getId));
      onSelectionChange(selectedItems.filter(i => !currentIds.has(getId(i))));
    } else {
      // Select all current page
      const newSelections = [...selectedItems];
      const selectedIds = new Set(newSelections.map(getId));
      currentData.forEach(row => {
        if (!selectedIds.has(getId(row))) {
          newSelections.push(row);
        }
      });
      onSelectionChange(newSelections);
    }
  };

  const isAllCurrentSelected = currentData.length > 0 && currentData.every(row => selectedItems.some(i => getId(i) === getId(row)));

  return (
    <div className="space-y-4">
      {/* Mobile view if renderMobileCard is provided */}
      {renderMobileCard && (
        <div className="grid grid-cols-1 gap-4 md:hidden">
          {currentData.length > 0 ? (
            currentData.map((row, idx) => (
              <div 
                key={idx} 
                onClick={() => {
                  if (onRowClick) {
                    onRowClick(row);
                  } else if (selectable && onSelectionChange) {
                    toggleRow(row);
                  }
                }}
                className={cn(
                  "neuglass rounded-2xl p-4",
                  (onRowClick || selectable) && "cursor-pointer hover:neuglass-pressed hover:bg-opacity-80 transition-colors",
                  selectable && selectedItems.some(i => getId(i) === getId(row)) && "ring-2 ring-blue-500 bg-blue-50/10"
                )}
              >
                {renderMobileCard(row, selectable ? selectedItems.some(i => getId(i) === getId(row)) : undefined, selectable ? () => toggleRow(row) : undefined)}
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Tidak ada data ditemukan</div>
          )}
        </div>
      )}

      {/* Desktop view (always visible if mobile view is not provided, otherwise hidden on mobile) */}
      <div className={cn(renderMobileCard ? "hidden md:block" : "block")}>
        <Table containerClassName="md:max-h-[calc(100vh-22rem)]">
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-12 text-center">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800"
                    checked={isAllCurrentSelected}
                    onChange={toggleAll}
                  />
                </TableHead>
              )}
              {columns.map((col, idx) => (
                <TableHead 
                  key={idx} 
                  className={cn(col.sortable ? "cursor-pointer select-none hover:bg-gray-100/50 dark:hover:bg-gray-800" : "", col.className)}
                  onClick={() => {
                    if (col.sortable && col.accessorKey) {
                      requestSort(col.accessorKey as string);
                    }
                  }}
                >
                  <div className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortConfig?.key === col.accessorKey && (
                      sortConfig?.direction === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentData.length > 0 ? (
              currentData.map((row, rowIndex) => (
                <TableRow 
                  key={rowIndex}
                  onClick={() => {
                    if (onRowClick) {
                      onRowClick(row);
                    } else if (selectable && onSelectionChange) {
                      toggleRow(row);
                    }
                  }}
                  className={cn((onRowClick || selectable) && "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50", selectable && selectedItems.some(i => getId(i) === getId(row)) && "bg-blue-50/50 dark:bg-blue-900/20")}
                >
                  {selectable && (
                    <TableCell 
                      className="w-12 text-center cursor-pointer" 
                      onClick={(e) => { e.stopPropagation(); toggleRow(row); }}
                    >
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 pointer-events-none"
                        checked={selectedItems.some(i => getId(i) === getId(row))}
                        readOnly
                      />
                    </TableCell>
                  )}
                  {columns.map((col, colIndex) => (
                    <TableCell key={colIndex}>
                      {col.cell 
                        ? col.cell(row) 
                        : col.accessorKey 
                          ? (row as any)[col.accessorKey] 
                          : null}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={selectable ? columns.length + 1 : columns.length} className="text-center py-8 text-gray-500 dark:text-gray-400">
                  Tidak ada data ditemukan
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-600 dark:text-gray-400 mt-4 px-2">
        <div className="flex items-center gap-2">
          <span>Menampilkan</span>
          <select
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="neuglass-pressed border border-gray-200 dark:border-gray-800 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {itemsPerPageOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <span>data dari {totalItems}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            className="p-1 rounded-md hover:neuglass disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:bg-transparent"
          >
            <ChevronsLeft size={18} />
          </button>
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="p-1 rounded-md hover:neuglass disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:bg-transparent"
          >
            <ChevronLeft size={18} />
          </button>
          
          <span className="px-2 py-1 font-medium select-none">
            {currentPage} / {totalPages}
          </span>

          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages || totalItems === 0}
            className="p-1 rounded-md hover:neuglass disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:bg-transparent"
          >
            <ChevronRight size={18} />
          </button>
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages || totalItems === 0}
            className="p-1 rounded-md hover:neuglass disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:bg-transparent"
          >
            <ChevronsRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
