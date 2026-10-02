import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConversationsTab from '../../src/components/ConversationsTab'
import { api } from '../../src/lib/api'

vi.mock('../../src/lib/api', () => ({
  api: { listConversations: vi.fn(), getConversation: vi.fn() },
}))

const TWO_THREADS = [
  {
    channel: 'facebook',
    sender_id: 'u1',
    message_count: 2,
    last_direction: 'out',
    last_type: 'text',
    last_text: 'Dạ đơn đã ghi nhận ạ',
    last_at: '2026-10-02T03:14:07.512345+00:00',
  },
  {
    channel: 'zalo_personal',
    sender_id: 'u2',
    message_count: 3,
    last_direction: 'in',
    last_type: 'text',
    last_text: 'cho mình hỏi size',
    last_at: '2026-10-01T10:00:00.000000+00:00',
  },
]

beforeEach(() => {
  api.listConversations.mockReset()
  api.getConversation.mockReset()
})

describe('ConversationsTab — đường chạy thuận lợi', () => {
  it('render 2 luồng; bấm 1 luồng -> gọi getConversation đúng tham số, transcript phân biệt Khách/Bot', async () => {
    api.listConversations.mockResolvedValue(TWO_THREADS)
    api.getConversation.mockResolvedValue({
      channel: 'facebook',
      sender_id: 'u1',
      messages: [
        { id: 1, direction: 'in', type: 'text', text: 'cho mình xem menu', created_at: '2026-10-02T03:14:01.000000+00:00' },
        { id: 2, direction: 'out', type: 'text', text: 'Dạ đơn đã ghi nhận ạ', created_at: '2026-10-02T03:14:02.000000+00:00' },
      ],
    })

    render(<ConversationsTab storeId="default" />)

    expect(await screen.findByText('u1')).toBeInTheDocument()
    expect(screen.getByText('u2')).toBeInTheDocument()

    await userEvent.click(screen.getByText('u1'))
    expect(api.getConversation).toHaveBeenCalledWith('default', 'facebook', 'u1')

    expect(await screen.findByText('cho mình xem menu')).toBeInTheDocument()
    expect(screen.getByText('Dạ đơn đã ghi nhận ạ')).toBeInTheDocument()
    expect(screen.getAllByText('Khách', { exact: false }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Bot', { exact: false }).length).toBeGreaterThan(0)
  })
})

describe('ConversationsTab — trường hợp biên', () => {
  it('listConversations trả [] -> hiện empty state, KHÔNG gọi getConversation', async () => {
    api.listConversations.mockResolvedValue([])
    render(<ConversationsTab storeId="default" />)
    expect(await screen.findByText('Chưa có hội thoại nào được lưu.')).toBeInTheDocument()
    expect(api.getConversation).not.toHaveBeenCalled()
  })

  it('luồng có messages: [] -> hiện câu giải thích "chưa có tin nhắn nào được lưu"', async () => {
    api.listConversations.mockResolvedValue(TWO_THREADS)
    api.getConversation.mockResolvedValue({ channel: 'facebook', sender_id: 'u1', messages: [] })

    render(<ConversationsTab storeId="default" />)
    await userEvent.click(await screen.findByText('u1'))

    expect(await screen.findByText(/chưa có tin nhắn nào được lưu/)).toBeInTheDocument()
  })
})

describe('ConversationsTab — đầu vào sai / thất bại đúng cách', () => {
  it('listConversations reject -> hiện ErrorBanner với đúng message, không crash', async () => {
    api.listConversations.mockRejectedValue(new Error('Lỗi 500'))
    render(<ConversationsTab storeId="default" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Lỗi 500')
  })
})
