import { test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadge from '../../src/components/StatusBadge';

test.each([
  ['logged_in', 'Đã đăng nhập'],
  ['awaiting_qr', 'Chờ quét QR'],
  ['error', 'Lỗi'],
  ['unknown', 'Chưa kết nối'],
  ['something-unrecognized', 'Chưa kết nối'],
])('renders the correct label for status %s', (status, expectedLabel) => {
  render(<StatusBadge status={status} />);
  expect(screen.getByText(expectedLabel)).toBeInTheDocument();
});
