import { Box, Card, Divider, IconButton, Slider, Switch, Typography } from '@mui/material'
import { Maximize2, Minus, Plus } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import type { ChartItem } from '@/api/types'
import StatusChip from '@/components/StatusChip'

export default function ChartViewer({ chart }: { chart: ChartItem }) {
  const [fit, setFit] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number; active: boolean } | null>(null)

  const canPan = zoom > 1
  const transform = useMemo(() => {
    const tx = canPan ? pan.x : 0
    const ty = canPan ? pan.y : 0
    return `translate(${tx}px, ${ty}px) scale(${zoom})`
  }, [canPan, pan.x, pan.y, zoom])

  const clampPan = (next: { x: number; y: number }) => {
    const limit = 260
    return {
      x: Math.max(-limit, Math.min(limit, next.x)),
      y: Math.max(-limit, Math.min(limit, next.y)),
    }
  }

  const setZoomSafe = (next: number) => {
    const z = Math.max(0.5, Math.min(2, next))
    setZoom(z)
    if (z <= 1) setPan({ x: 0, y: 0 })
  }

  return (
    <Card sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800 }} noWrap>
              {chart.fileName || chart.title}
            </Typography>
            <StatusChip status={chart.status} />
          </Box>
          <Typography variant="caption" color="text.secondary">
            {chart.title}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton size="small" onClick={() => setZoomSafe(zoom - 0.1)}>
            <Minus size={18} />
          </IconButton>
          <IconButton size="small" onClick={() => setZoomSafe(zoom + 0.1)}>
            <Plus size={18} />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => {
              setFit(true)
              setZoomSafe(1)
              setPan({ x: 0, y: 0 })
            }}
          >
            <Maximize2 size={18} />
          </IconButton>
          <Divider orientation="vertical" flexItem />
          <Typography variant="caption" color="text.secondary">
            Vừa khít màn hình
          </Typography>
          <Switch
            size="small"
            checked={fit}
            onChange={(e) => {
              setFit(e.target.checked)
              if (e.target.checked) {
                setZoomSafe(1)
                setPan({ x: 0, y: 0 })
              }
            }}
          />
        </Box>
      </Box>

      <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ width: 56 }}>
          Zoom
        </Typography>
        <Slider
          value={Math.round(zoom * 100)}
          min={50}
          max={200}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v}%`}
          onChange={(_, v) => {
            const n = Array.isArray(v) ? v[0] : v
            setFit(false)
            setZoomSafe(n / 100)
          }}
        />
      </Box>

      <Box
        sx={{
          mt: 2,
          height: { xs: 420, md: 560 },
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.default',
          overflow: 'hidden',
          position: 'relative',
          cursor: canPan ? 'grab' : 'default',
        }}
        onPointerDown={(e) => {
          if (!canPan) return
          dragRef.current = { x: pan.x, y: pan.y, startX: e.clientX, startY: e.clientY, active: true }
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const d = dragRef.current
          if (!d?.active) return
          const dx = e.clientX - d.startX
          const dy = e.clientY - d.startY
          setPan(clampPan({ x: d.x + dx, y: d.y + dy }))
        }}
        onPointerUp={() => {
          if (dragRef.current) dragRef.current.active = false
        }}
      >
        {chart.imageUrl ? (
          <Box
            component="img"
            src={chart.imageUrl}
            alt={chart.title}
            sx={{
              width: '100%',
              height: '100%',
              objectFit: fit ? 'contain' : 'cover',
              transform,
              transformOrigin: 'center',
              userSelect: 'none',
              pointerEvents: 'none',
              transition: fit ? 'transform 150ms ease-out' : 'none',
            }}
          />
        ) : (
          <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
            <Typography color="text.secondary">Chưa có ảnh biểu đồ</Typography>
          </Box>
        )}
      </Box>
    </Card>
  )
}
