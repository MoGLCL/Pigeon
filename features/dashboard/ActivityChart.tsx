"use client";

import { useState } from "react";

type Series = { labels: string[]; facebook: number[]; whatsapp: number[] };
const W = 680;
const H = 210;
const PAD = 28;

export function ActivityChart({ series }: { series: Series }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...series.facebook, ...series.whatsapp);
  const pointX = (index: number, length = series.labels.length) =>
    PAD + (index * (W - PAD * 2)) / Math.max(1, length - 1);
  const pointY = (value: number) => H - PAD - (value / max) * (H - PAD * 2);
  const pathFor = (values: number[]) =>
    values
      .map(
        (value, index) =>
          `${index ? "L" : "M"}${pointX(index, values.length)},${pointY(value)}`,
      )
      .join(" ");

  return (
    <div className="chart-wrap">
      <div className="chart-legend">
        <span>
          <i className="dot facebook" />
          Facebook
        </span>
        <span>
          <i className="dot whatsapp" />
          WhatsApp
        </span>
        <small>Hover a point for details</small>
      </div>
      <div className="interactive-chart">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Facebook and WhatsApp message activity for the selected period"
          onMouseLeave={() => setActive(null)}
        >
          {[1, 2, 3, 4].map((line) => (
            <line
              key={line}
              x1={PAD}
              x2={W - PAD}
              y1={H - PAD - (line / 4) * (H - PAD * 2)}
              y2={H - PAD - (line / 4) * (H - PAD * 2)}
              className="grid-line"
            />
          ))}
          <path d={pathFor(series.facebook)} className="chart-line fb-line" />
          <path d={pathFor(series.whatsapp)} className="chart-line wa-line" />
          {active !== null && (
            <line
              className="chart-focus-line"
              x1={pointX(active)}
              x2={pointX(active)}
              y1={PAD}
              y2={H - PAD}
            />
          )}
          {series.facebook.map((value, index) => (
            <circle
              key={`f${index}`}
              cx={pointX(index, series.facebook.length)}
              cy={pointY(value)}
              r={active === index ? 6 : 4}
              className="fb-point"
            />
          ))}
          {series.whatsapp.map((value, index) => (
            <circle
              key={`w${index}`}
              cx={pointX(index, series.whatsapp.length)}
              cy={pointY(value)}
              r={active === index ? 6 : 4}
              className="wa-point"
            />
          ))}
          {series.labels.map((label, index) => (
            <rect
              key={label}
              className="chart-hit-area"
              x={pointX(index) - 20}
              y={PAD}
              width="40"
              height={H - PAD * 2}
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              tabIndex={0}
              aria-label={`${new Date(label).toLocaleDateString()}: ${series.facebook[index] || 0} Facebook, ${series.whatsapp[index] || 0} WhatsApp messages`}
            />
          ))}
        </svg>
        {active !== null && series.labels[active] && (
          <div
            className="chart-tooltip"
            style={{ left: `${(pointX(active) / W) * 100}%` }}
          >
            <strong>
              {new Date(series.labels[active]).toLocaleDateString()}
            </strong>
            <span>
              <i className="dot facebook" />
              {series.facebook[active] || 0} Facebook
            </span>
            <span>
              <i className="dot whatsapp" />
              {series.whatsapp[active] || 0} WhatsApp
            </span>
          </div>
        )}
      </div>
      <div className="chart-labels">
        {series.labels.map((label) => (
          <span key={label}>
            {new Date(label).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        ))}
      </div>
    </div>
  );
}
