import { Chip } from '@mui/material'

import type { BatchRunStatus, ChartStatus } from '@/api/types'

type Status = ChartStatus | BatchRunStatus

const map: Record<Status, { label: string; color: 'default' | 'success' | 'warning' | 'error' }> = {
  new: { label: 'Mới', color: 'default' },
  processed: { label: 'Đã xử lý', color: 'success' },
  running: { label: 'Đang chạy', color: 'warning' },
  error: { label: 'Lỗi', color: 'error' },
  Running: { label: 'Running', color: 'warning' },
  Done: { label: 'Done', color: 'success' },
  Error: { label: 'Error', color: 'error' },
}

export default function StatusChip({ status }: { status: Status }) {
  const m = map[status]
  return (
    <Chip
      size="small"
      label={m.label}
      color={m.color}
      variant={m.color === 'default' ? 'outlined' : 'filled'}
    />
  )
}
