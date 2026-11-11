import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Data table (Main board `.tbl`): uppercase muted head on sunk2, hairline row dividers,
 * row hover. Styling lives in `.mp-table` (globals.css, `.mun-paper` scope). Wrap it in
 * `.mp-panel .mp-panel-flush` for the rounded card look. On phones, pages render
 * row cards instead of this table (Main page rules: "Tables → row cards").
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table data-slot="table" className={cn("mp-table", className)} {...props} />
    </div>
  )
}

function TableHeader(props: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" {...props} />
}

function TableBody(props: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" {...props} />
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr data-slot="table-row" className={className} {...props} />
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return <th data-slot="table-head" className={className} {...props} />
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td data-slot="table-cell" className={className} {...props} />
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell }
