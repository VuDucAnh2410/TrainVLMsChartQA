import { Alert, Snackbar } from '@mui/material'
import { useMemo } from 'react'

import { useToastStore } from '@/store/toast'

export default function ToastHost() {
  const queue = useToastStore((s) => s.queue)
  const shift = useToastStore((s) => s.shift)

  const current = useMemo(() => queue[0], [queue])

  return (
    <Snackbar
      open={!!current}
      onClose={shift}
      autoHideDuration={3200}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      {current ? (
        <Alert onClose={shift} severity={current.kind} variant="filled" sx={{ minWidth: 360 }}>
          {current.message}
        </Alert>
      ) : null}
    </Snackbar>
  )
}
