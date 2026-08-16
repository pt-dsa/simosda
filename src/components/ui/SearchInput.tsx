import React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, onClear, ...props }, ref) => {
    return (
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <Search className="h-4 w-4 text-gray-400" />
        </div>
        <input
          type="text"
          className={cn(
            "block w-full rounded-full pl-10 pr-10 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 neuglass-pressed focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all",
            className
          )}
          ref={ref}
          {...props}
        />
        {props.value && onClear && (
          <button
            type="button"
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            onClick={onClear}
            aria-label="Hapus kata kunci pencarian"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }
);
SearchInput.displayName = "SearchInput";
