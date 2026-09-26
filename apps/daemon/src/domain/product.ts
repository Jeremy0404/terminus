import { DomainError } from './errors.js';

export interface ProductJournal {
  readonly purpose: string;
  readonly audience: string;
  readonly outOfScope: string;
  readonly decisions: string;
  readonly appUrl: string;
}

export function productJournal(input: ProductJournal): ProductJournal {
  const product = { purpose: input.purpose.trim(), audience: input.audience.trim(), outOfScope: input.outOfScope.trim(), decisions: input.decisions.trim(), appUrl: input.appUrl.trim() };
  if (Object.values(product).some((text) => text.length > 4000)) throw new DomainError('Product journal fields are limited to 4000 characters');
  if (product.appUrl) {
    let url: URL;
    try { url = new URL(product.appUrl); } catch { throw new DomainError('Invalid application URL'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new DomainError('The application URL must use HTTP or HTTPS without credentials');
  }
  return product;
}
