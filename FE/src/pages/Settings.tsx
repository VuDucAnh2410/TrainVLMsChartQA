import { useEffect } from 'react'
import { Box, Button, Card, FormControlLabel, Switch, TextField, Typography } from '@mui/material'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useSettingsStore } from '@/store/settings'
import { useToastStore } from '@/store/toast'

const schema = z.object({
  qwenBaseURL: z.string().min(1),
  internBaseURL: z.string().min(1),
  singleModel: z.coerce.boolean().default(true),
  max_new_tokens: z.coerce.number().int().min(16).max(2048),
  temperature: z.coerce.number().min(0).max(2),
})

type FormValues = z.infer<typeof schema>

export default function Settings() {
  const pushToast = useToastStore((s) => s.push)
  const qwenBaseURL = useSettingsStore((s) => s.qwenBaseURL)
  const internBaseURL = useSettingsStore((s) => s.internBaseURL)
  const singleModel = useSettingsStore((s) => s.singleModel)
  const decode = useSettingsStore((s) => s.decode)
  const setQwenBaseURL = useSettingsStore((s) => s.setQwenBaseURL)
  const setInternBaseURL = useSettingsStore((s) => s.setInternBaseURL)
  const setSingleModel = useSettingsStore((s) => s.setSingleModel)
  const setDecode = useSettingsStore((s) => s.setDecode)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      qwenBaseURL,
      internBaseURL,
      singleModel,
      max_new_tokens: decode.max_new_tokens,
      temperature: decode.temperature,
    },
  })

  const onSubmit = handleSubmit((v) => {
    setQwenBaseURL(v.qwenBaseURL)
    setInternBaseURL(v.internBaseURL)
    setSingleModel(v.singleModel)
    setDecode({ max_new_tokens: v.max_new_tokens, temperature: v.temperature })
    pushToast('success', 'Đã lưu cài đặt')
  })

  useEffect(() => {
    const subscription = watch((v) => {
      if (v.qwenBaseURL) setQwenBaseURL(v.qwenBaseURL)
      if (v.internBaseURL) setInternBaseURL(v.internBaseURL)
      if (v.singleModel !== undefined) setSingleModel(v.singleModel)
      if (v.max_new_tokens !== undefined && v.temperature !== undefined) {
        setDecode({ max_new_tokens: v.max_new_tokens, temperature: v.temperature })
      }
    })
    return () => subscription.unsubscribe()
  }, [watch, setQwenBaseURL, setInternBaseURL, setSingleModel, setDecode])

  return (
    <Box>
      <Typography variant="h1">Cài đặt</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        Lưu vào localStorage để dùng cho API client và chế độ single-model.
      </Typography>

      <Card sx={{ mt: 2, p: 2 }}>
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          <TextField label="Qwen service base URL" {...register('qwenBaseURL')} placeholder="http://127.0.0.1:8002" />
          <TextField label="Intern service base URL" {...register('internBaseURL')} placeholder="http://127.0.0.1:8001" />

          <FormControlLabel
            control={
              <Switch
                checked={watch('singleModel')}
                onChange={(e) => setValue('singleModel', e.target.checked)}
              />
            }
            label="Single-model mode"
          />

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
            <TextField label="max_new_tokens" type="number" {...register('max_new_tokens')} />
            <TextField label="temperature" type="number" inputProps={{ step: 0.05 }} {...register('temperature')} />
          </Box>
        </Box>

        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="contained" onClick={onSubmit} disabled={isSubmitting}>
            Save
          </Button>
        </Box>
      </Card>
    </Box>
  )
}
