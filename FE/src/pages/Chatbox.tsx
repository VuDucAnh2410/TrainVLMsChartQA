import { zodResolver } from '@hookform/resolvers/zod'
import {
  Avatar,
  Box,
  Button,
  Card,
  Divider,
  IconButton,
  Skeleton,
  TextField,
  Typography,
} from '@mui/material'
import { ImagePlus, SendHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'

import {
  useChartService,
  useChartsService,
  useCreateConversationService,
  usePredictService,
  useRenameConversationService,
  useSetConversationImageService,
} from '@/api/queries'
import type { ModelService } from '@/api/types'
import EmptyState from '@/components/EmptyState'
import StatusChip from '@/components/StatusChip'
import { useChatStore } from '@/store/chat'
import { useSettingsStore } from '@/store/settings'
import { useToastStore } from '@/store/toast'

const schema = z.object({
  message: z.string().trim().min(1, 'Vui lòng nhập câu hỏi'),
})

type FormValues = z.infer<typeof schema>

const EMPTY_MESSAGES: ReturnType<typeof useChatStore.getState>['byChartId'][string] = []

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

export default function Chatbox({ service }: { service: ModelService }) {
  const { chatId } = useParams()
  const nav = useNavigate()

  const chartsQ = useChartsService(service)
  const chartQ = useChartService(service, chatId)

  const createConv = useCreateConversationService(service)
  const setImage = useSetConversationImageService(service)
  const renameConv = useRenameConversationService(service)
  const predict = usePredictService(service)

  const decode = useSettingsStore((s) => s.decode)
  const qwenBaseURL = useSettingsStore((s) => s.qwenBaseURL)
  const internBaseURL = useSettingsStore((s) => s.internBaseURL)

  const pushToast = useToastStore((s) => s.push)
  const addMsg = useChatStore((s) => s.add)
  const updateMsg = useChatStore((s) => s.update)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [booting, setBooting] = useState(false)
  const creatingRef = useRef(false) // Guard to prevent duplicate creation

  const storeMessages = useChatStore((s) => (chatId ? s.byChartId[chatId] : undefined))
  const messages = storeMessages || EMPTY_MESSAGES

  useEffect(() => {
    if (!chatId) return
    localStorage.setItem('cia_last_chat', chatId)
  }, [chatId])

  const title = useMemo(() => {
    if (chartQ.data?.title) return chartQ.data.title
    if (chatId) return 'Chatbox'
    return 'Chatbox'
  }, [chartQ.data?.title, chatId])

  const serviceBaseURL = service === 'intern' ? internBaseURL : qwenBaseURL
  const contextImageUrl = chartQ.data?.imageUrl || ''

  // Use useMemo để tránh re-render vô hạn
  const resolvedContextImageUrl = useMemo(() => {
    if (!contextImageUrl) {
      return ''
    }
    if (contextImageUrl.startsWith('http://') || contextImageUrl.startsWith('https://')) {
      return contextImageUrl
    }
    if (!serviceBaseURL) {
      console.warn('[CHATBOX IMAGE] No serviceBaseURL configured! Using relative path (may fail):', contextImageUrl)
      return contextImageUrl
    }
    const resolved = `${serviceBaseURL.replace(/\/$/, '')}${contextImageUrl.startsWith('/') ? '' : '/'}${contextImageUrl}`
    console.log('[CHATBOX IMAGE] Resolved URL:', resolved, 'from raw:', contextImageUrl)
    return resolved
  }, [contextImageUrl, serviceBaseURL]) // Only recompute when these change

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { message: '' },
  })

  useEffect(() => {
    if (chatId) return
    if (booting) return
    if (chartsQ.isLoading) return
    if (creatingRef.current) {
      console.log('[CHATBOX BOOT] Already creating, skipping...')
      return
    }

    const list = chartsQ.data || []
    const last = localStorage.getItem('cia_last_chat')
    const target = last && list.some((c) => c.id === last) ? last : list[0]?.id

    if (target) {
      console.log('[CHATBOX BOOT] Found existing conversation, navigating:', target)
      nav(`/chat/${target}`, { replace: true })
      return
    }

    console.log('[CHATBOX BOOT] No conversation found, creating new one...')
    setBooting(true)
    creatingRef.current = true
    createConv
      .mutateAsync({})
      .then((c) => {
        console.log('[CHATBOX BOOT] Created conversation:', c.id)
        nav(`/chat/${c.id}`, { replace: true })
      })
      .catch((err) => {
        console.error('[CHATBOX BOOT] Failed to create conversation:', err)
      })
      .finally(() => {
        setBooting(false)
        creatingRef.current = false
      })
  }, [booting, chatId, chartsQ.data, chartsQ.isLoading, nav, service]) // Removed createConv from deps

  if (!chatId) {
    return (
      <Box>
        <Typography variant="h1">Chat Qwen</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Đang chuẩn bị cuộc trò chuyện…
        </Typography>
        <Box sx={{ mt: 2 }}>
          <Skeleton variant="rounded" height={520} />
        </Box>
      </Box>
    )
  }

  if (chartQ.isLoading) {
    return (
      <Box sx={{ display: { xs: 'block', md: 'flex' }, gap: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="rounded" height={680} />
        </Box>
        <Box sx={{ width: { xs: '100%', md: 380 }, mt: { xs: 2, md: 0 } }}>
          <Skeleton variant="rounded" height={680} />
        </Box>
      </Box>
    )
  }

  if (!chartQ.data) {
    return (
      <Box>
        <EmptyState title="Không tìm thấy cuộc trò chuyện" subtitle="Phiên này không tồn tại hoặc đã bị xoá." />
        <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
          <Button variant="outlined" onClick={() => nav('/charts')}>
            Quay lại Kho trò chuyện
          </Button>
          <Button
            variant="contained"
            disabled={createConv.isPending}
            onClick={async () => nav(`/chat/${(await createConv.mutateAsync({})).id}`)}
          >
            Cuộc trò chuyện mới
          </Button>
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ display: { xs: 'block', md: 'flex' }, gap: 2, alignItems: 'flex-start' }}>
      <Card
        sx={{
          flex: 1,
          minWidth: 0,
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          height: { xs: 'auto', md: 'calc(100vh - 56px - 32px)' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800 }} noWrap>
              {title}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {chartQ.data.course || '—'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <StatusChip status={chartQ.data.status} />
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                setPendingImage(null)
                inputRef.current?.click()
              }}
              startIcon={<ImagePlus size={18} />}
              sx={{ borderRadius: 2 }}
            >
              Tải ảnh
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setPendingImage(file)
                e.target.value = ''
              }}
            />
          </Box>
        </Box>

        {pendingImage ? (
          <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0 }} noWrap>
              Đã chọn ảnh: {pendingImage.name}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                variant="contained"
                disabled={setImage.isPending}
                onClick={async () => {
                  try {
                    await setImage.mutateAsync({ chatId, file: pendingImage })
                    setPendingImage(null)
                    pushToast('success', 'Đã cập nhật ảnh ngữ cảnh')
                  } catch {
                    pushToast('error', 'Không thể tải ảnh')
                  }
                }}
              >
                Dùng làm ngữ cảnh
              </Button>
              <IconButton size="small" onClick={() => setPendingImage(null)}>
                <X size={18} />
              </IconButton>
            </Box>
          </Box>
        ) : null}

        <Divider sx={{ my: 1.5 }} />

        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1.25, pr: 0.5 }}>
          {messages.length ? (
            messages.map((m) => (
              <Box
                key={m.id}
                sx={{
                  display: 'flex',
                  justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, maxWidth: '86%' }}>
                  {m.role === 'assistant' ? (
                    <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.main' }}>A</Avatar>
                  ) : null}
                  <Box
                    sx={{
                      p: 1.25,
                      borderRadius: 3,
                      bgcolor: m.role === 'user' ? 'rgba(79,70,229,0.10)' : 'background.default',
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    {m.imageUrl ? (
                      <Box
                        component="img"
                        src={m.imageUrl}
                        alt={m.imageName || 'upload'}
                        sx={{ width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 2, mb: 1 }}
                      />
                    ) : null}
                    {m.answer ? (
                      <Typography sx={{ fontSize: 18, fontWeight: 700, color: 'text.primary', display: 'block' }}>
                        {m.answer.result}
                      </Typography>
                    ) : (
                      <Typography sx={{ whiteSpace: 'pre-wrap' }}>{m.content}</Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      {formatTime(m.createdAt)}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            ))
          ) : (
            <EmptyState title="Bắt đầu cuộc trò chuyện" subtitle="Tải ảnh ngữ cảnh (tuỳ chọn) và đặt câu hỏi đầu tiên." />
          )}
        </Box>

        <Divider sx={{ my: 1.5 }} />

        <Box
          component="form"
          onSubmit={form.handleSubmit(async (values) => {
            const isFirstMessage = messages.length === 0
            const nextTitle = values.message.trim().slice(0, 48)

            const userMsgId = `m_${Math.random().toString(36).slice(2, 10)}`
            const pendingMsgId = `m_${Math.random().toString(36).slice(2, 10)}`

            console.log('[CHATBOX SUBMIT] Creating messages. User:', userMsgId, 'Pending:', pendingMsgId)

            addMsg(chatId, {
              id: userMsgId,
              role: 'user',
              content: values.message.trim(),
              createdAt: new Date().toISOString(),
            })

            addMsg(chatId, {
              id: pendingMsgId,
              role: 'assistant',
              content: 'Đang xử lý…',
              createdAt: new Date().toISOString(),
              answer: { result: 'Đang xử lý…', reasoning: 'Đang xử lý…' },
            })

            form.reset({ message: '' })

            if (isFirstMessage && chartQ.data?.title === 'Cuộc trò chuyện mới') {
              renameConv.mutate({ chatId, title: nextTitle || 'Cuộc trò chuyện mới' })
            }

            try {
              const ans = await predict.mutateAsync({
                chartId: chatId,
                question: values.message.trim(),
                params: { max_new_tokens: decode.max_new_tokens, temperature: decode.temperature, lang: 'vi' },
              })

              console.log('[CHATBOX SUBMIT] Got answer, updating pending message:', pendingMsgId)

              // UPDATE pending message instead of creating new one
              updateMsg(chatId, pendingMsgId, {
                content: ans.reasoning,
                createdAt: ans.createdAt,
                answer: { result: ans.answer, reasoning: ans.reasoning },
              })

              if (ans.status === 'error') {
                pushToast('error', ans.answer || 'Model lỗi / chưa sẵn sàng')
              } else {
                pushToast('success', 'Đã trả lời')
              }
            } catch (err) {
              console.error('[CHATBOX SUBMIT] Predict error:', err)

              // UPDATE pending message with error
              updateMsg(chatId, pendingMsgId, {
                content: 'Lỗi khi gửi câu hỏi (có thể model đang tải hoặc quá chậm).',
                createdAt: new Date().toISOString(),
                answer: {
                  result: 'Lỗi khi gửi câu hỏi',
                  reasoning: 'Lỗi khi gửi câu hỏi (có thể model đang tải hoặc quá chậm).',
                },
              })

              pushToast('error', 'Lỗi khi gửi câu hỏi')
            }
          })}
          sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, position: 'relative' }}
        >
          <TextField
            {...form.register('message')}
            placeholder="Đặt câu hỏi…"
            fullWidth
            multiline
            minRows={1}
            maxRows={4}
            error={!!form.formState.errors.message}
            helperText={form.formState.errors.message?.message || ' '}
            disabled={predict.isPending}
          />
          <IconButton
            type="submit"
            disabled={predict.isPending}
            sx={{
              bgcolor: 'primary.main',
              color: 'common.white',
              ':hover': { bgcolor: 'primary.dark' },
              mb: 0.5,
              width: 56,
              height: 56,
              position: 'absolute',
              top: '50%',
              right: 8,
              transform: 'translateY(-50%)',
            }}
          >
            <SendHorizontal size={18} />
          </IconButton>
        </Box>
      </Card>

      <Box
        sx={{
          width: { xs: '100%', md: 380 },
          mt: { xs: 2, md: 0 },
          position: { xs: 'static', md: 'sticky' },
          top: { md: 72 },
          alignSelf: { md: 'flex-start' },
          display: 'grid',
          gap: 2,
        }}
      >
        <Card sx={{ p: 2 }}>
          <Typography sx={{ fontWeight: 900, letterSpacing: 0.4 }}>NGỮ CẢNH</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Ảnh được dùng để trả lời câu hỏi trong phiên này.
          </Typography>
          <Box
            sx={{
              mt: 1.5,
              height: 220,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              overflow: 'hidden',
              bgcolor: 'background.default',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {resolvedContextImageUrl ? (
              <Box
                component="img"
                src={resolvedContextImageUrl}
                alt="context"
                sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => {
                  console.error('[CHATBOX CONTEXT] Failed to load image:', resolvedContextImageUrl);
                  e.currentTarget.style.display = 'none';
                }}
                onLoad={(e) => {
                  console.log('[CHATBOX CONTEXT] Image loaded successfully:', resolvedContextImageUrl);
                  console.log('[CHATBOX CONTEXT] Image dimensions:', (e.target as HTMLImageElement).naturalWidth, 'x', (e.target as HTMLImageElement).naturalHeight);
                  console.log('[CHATBOX CONTEXT] Image display:', (e.target as HTMLImageElement).style.display);
                }}
              />
            ) : (
              <Typography variant="caption" color="text.secondary">
                Chưa có ảnh
              </Typography>
            )}
          </Box>
        </Card>

        <Card sx={{ p: 2 }}>
          <Typography sx={{ fontWeight: 900, letterSpacing: 0.4 }}>GỢI Ý</Typography>
          <Box sx={{ mt: 1.25, display: 'grid', gap: 1 }}>
            {[
              'Tóm tắt nội dung chính?',
              'Điểm bất thường nằm ở đâu?',
              'Giải thích xu hướng tăng/giảm?',
              'Kiểm tra tỷ lệ trục và chú giải?',
            ].map((t) => (
              <Button
                key={t}
                variant="outlined"
                size="small"
                onClick={() => form.setValue('message', t, { shouldDirty: true, shouldTouch: true })}
                sx={{ justifyContent: 'flex-start', borderRadius: 2 }}
              >
                {t}
              </Button>
            ))}
          </Box>
        </Card>
      </Box>
    </Box>
  )
}
