import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { chartAxis, chartGrid, chartLegend, chartTooltip } from '@/lib/dashboard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type ChartRow = { period: string; [key: string]: string | number };
export function ActivityChart({
  title,
  description,
  rows,
  series,
  unavailable,
}: {
  title: string;
  description: string;
  rows: ChartRow[] | null;
  series: { key: string; label: string; color: string; dash?: string }[];
  unavailable: string;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h3>{title}</h3>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows ? (
          <>
            <div role="img" aria-label={title} className="h-64 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid {...chartGrid} />
                  <XAxis dataKey="period" {...chartAxis} minTickGap={16} />
                  <YAxis allowDecimals={false} {...chartAxis} />
                  <Tooltip {...chartTooltip} />
                  <Legend {...chartLegend} />
                  {series.map((s) => (
                    <Line
                      key={s.key}
                      dataKey={s.key}
                      name={s.label}
                      stroke={s.color}
                      strokeWidth={2}
                      strokeDasharray={s.dash}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Ver datos de {title.toLowerCase()}
              </summary>
              <div className="mt-2 max-h-64 overflow-auto rounded-md border">
                <table className="w-full text-left">
                  <caption className="sr-only">{title}</caption>
                  <thead>
                    <tr>
                      <th>Período</th>
                      {series.map((s) => (
                        <th key={s.key} className="text-right">
                          {s.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.period}>
                        <td>{row.period}</td>
                        {series.map((s) => (
                          <td key={s.key} className="numeric">
                            {row[s.key]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{unavailable}</p>
        )}
      </CardContent>
    </Card>
  );
}
