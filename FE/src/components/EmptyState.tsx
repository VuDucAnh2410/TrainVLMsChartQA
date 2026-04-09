import { Box, Typography } from '@mui/material'

export default function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Box
      sx={{
        p: 4,
        textAlign: 'center',
        border: '1px dashed',
        borderColor: 'divider',
        borderRadius: 3,
        bgcolor: 'background.paper',
      }}
    >
      <Typography fontWeight={700}>{title}</Typography>
      {subtitle ? (
        <Typography sx={{ mt: 0.5 }} variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
      ) : null}
    </Box>
  )
}
