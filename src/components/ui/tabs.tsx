"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center gap-1 rounded-2xl p-1.5 text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none data-[variant=line]:p-0",
  {
    variants: {
      variant: {
        default: "bg-card/40 backdrop-blur-xl border border-border/60",
        line: "gap-1 bg-transparent border-0",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), variant === "default" && "relative isolate", className)}
      {...props}
    >
      {variant === "default" && (
        <TabsPrimitive.Indicator
          data-slot="tabs-indicator"
          className="absolute z-0 rounded-xl bg-primary shadow-sm shadow-primary/10 transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{
            left: "var(--active-tab-left)",
            top: "var(--active-tab-top)",
            width: "var(--active-tab-width)",
            height: "var(--active-tab-height)",
          }}
        />
      )}
      {children}
    </TabsPrimitive.List>
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        // Pill segmented tab — matches the project's reference style. Sits above the sliding Indicator.
        "relative z-10 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // Default variant: active text sits on the primary Indicator pill
        "group-data-[variant=default]/tabs-list:data-active:text-primary-foreground",
        // Line variant: active = underline, transparent bg
        "group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:px-2 group-data-[variant=line]/tabs-list:data-active:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn(
        "flex-1 text-sm outline-none data-[activation-direction]:animate-in data-[activation-direction]:fade-in-0 data-[activation-direction]:slide-in-from-bottom-1 data-[activation-direction]:duration-300 motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
