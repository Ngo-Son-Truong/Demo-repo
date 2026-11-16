/**
 * Catalog + định giá.
 *
 * Nguyên tắc bắt buộc: số tiền thanh toán LUÔN tính ở server.
 * Client chỉ gửi {id, qty}. Nếu lấy `amount` từ body POST /api/checkout,
 * ai cũng có thể mua 50.000đ với giá 1.000đ.
 */
import type { CartLine } from './types.ts';

export interface Product {
  id: string;
  name: string;
  price: number;
  emoji: string;
  desc: string;
}

export const CATALOG: Product[] = [
  { id: 'SKU-COFFEE', name: 'Cà phê filtrista Hoi An', price: 85_000, emoji: '☕', desc: '250g, rang mộc' },
  { id: 'SKU-LANTERN', name: 'Đèn lồng lụa Hội An', price: 250_000, emoji: '🏮', desc: 'size 35cm, kèm tre' },
  { id: 'SKU-TOTE', name: 'Tote canvas may đo', price: 165_000, emoji: '👜', desc: '12oz, in chìm' },
  { id: 'SKU-TOUR', name: 'Tour rừng dừa Bảy Mẫu', price: 420_000, emoji: '🛶', desc: '3 tiếng, bao gồm ghe' },
];

export const SHIPPING = { fee: 30_000, freeOver: 500_000 } as const;

export interface CartResult {
  lines: CartLine[];
  subtotal: number;
  shipping: number;
  total: number;
  error?: string;
}

export interface CartItemInput {
  id?: unknown;
  qty?: unknown;
}

export function priceCart(items: unknown): CartResult {
  const lines: CartLine[] = [];
  for (const raw of Array.isArray(items) ? (items as CartItemInput[]) : []) {
    const product = CATALOG.find((p) => p.id === raw?.id);
    if (!product) {
      return { lines: [], subtotal: 0, shipping: 0, total: 0, error: `Sản phẩm không tồn tại: ${String(raw?.id)}` };
    }
    const qty = Math.trunc(Number(raw.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 20) {
      return { lines: [], subtotal: 0, shipping: 0, total: 0, error: 'Số lượng phải từ 1 đến 20' };
    }
    lines.push({ ...product, qty, lineTotal: product.price * qty });
  }
  if (!lines.length) return { lines: [], subtotal: 0, shipping: 0, total: 0, error: 'Giỏ hàng trống' };

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const shipping = subtotal >= SHIPPING.freeOver ? 0 : SHIPPING.fee;
  return { lines, subtotal, shipping, total: subtotal + shipping };
}
