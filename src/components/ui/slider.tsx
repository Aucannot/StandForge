import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"
import { cn } from "../../lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "group relative flex w-full touch-none select-none items-center py-3",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="standforge-slider-track relative h-2 w-full grow overflow-hidden rounded-full bg-[hsl(var(--muted))] dark:bg-white/10">
      <SliderPrimitive.Range className="standforge-slider-range absolute h-full rounded-full bg-[hsl(var(--primary))]" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="standforge-slider-thumb block h-5 w-5 rounded-full border border-black/10 bg-white shadow-app-sm transition-[box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-hover:scale-105 dark:border-white/10 dark:bg-foreground" />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
