'use client'

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { performanceTrend } from '@/lib/mock-data'

const chartConfig = {
  leads: { label: 'Leads', color: 'var(--chart-1)' },
  revenue: { label: 'Revenue', color: 'var(--chart-2)' },
} satisfies ChartConfig

export function PerformanceChart() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Performance trend</CardTitle>
        <CardDescription>Leads and revenue over the last 14 days</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
          <AreaChart data={performanceTrend} margin={{ left: 4, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="fillLeads" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-leads)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--color-leads)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              className="text-xs"
            />
            <YAxis hide />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
            <Area
              dataKey="revenue"
              type="monotone"
              fill="url(#fillRevenue)"
              stroke="var(--color-revenue)"
              strokeWidth={2}
            />
            <Area
              dataKey="leads"
              type="monotone"
              fill="url(#fillLeads)"
              stroke="var(--color-leads)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
