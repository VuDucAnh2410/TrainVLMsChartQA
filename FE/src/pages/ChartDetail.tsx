import { Box, Skeleton, Typography } from '@mui/material'
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useChart } from '@/api/queries'
import ChatPanel from '@/components/ChatPanel'
import ChartViewer from '@/components/ChartViewer'
import EmptyState from '@/components/EmptyState'

export default function ChartDetail() {
  const { chartId } = useParams()
  const nav = useNavigate()
  const q = useChart(chartId)

  const title = useMemo(() => q.data?.title || '—', [q.data?.title])

  if (!chartId) {
    return <EmptyState title="Thiếu chartId" subtitle="Quay lại kho biểu đồ để chọn một biểu đồ." />
  }

  if (q.isLoading) {
    return (
      <Box sx={{ display: { xs: 'block', md: 'flex' }, gap: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="rounded" height={680} />
        </Box>
        <Box sx={{ width: { xs: '100%', md: 400 }, mt: { xs: 2, md: 0 } }}>
          <Skeleton variant="rounded" height={680} />
        </Box>
      </Box>
    )
  }

  if (!q.data) {
    return (
      <Box>
        <EmptyState title="Không tìm thấy biểu đồ" subtitle="Biểu đồ này không tồn tại hoặc đã bị xoá." />
        <Box sx={{ mt: 2 }}>
          <Typography
            component="button"
            onClick={() => nav('/charts')}
            sx={{
              border: 0,
              bgcolor: 'transparent',
              color: 'primary.main',
              fontWeight: 800,
              cursor: 'pointer',
              p: 0,
            }}
          >
            Quay lại /charts
          </Typography>
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ display: { xs: 'block', md: 'flex' }, gap: 2, alignItems: 'flex-start' }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <ChartViewer chart={q.data} />
      </Box>
      <Box
        sx={{
          width: { xs: '100%', md: 400 },
          mt: { xs: 2, md: 0 },
          position: { xs: 'static', md: 'sticky' },
          top: { md: 72 },
          alignSelf: { md: 'flex-start' },
        }}
      >
        <ChatPanel chartId={chartId} chartTitle={title} />
      </Box>
    </Box>
  )
}
