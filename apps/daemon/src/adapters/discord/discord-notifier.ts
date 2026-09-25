import type { DeployNotifier } from '../../application/ports/deploy-notifier.js';

export class DiscordNotifier implements DeployNotifier {
  constructor(
    private readonly webhook: string,
    private readonly onError: (error: unknown) => void,
  ) {}

  notify(message: string): void {
    fetch(this.webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: message, allowed_mentions: { parse: [] } }),
    }).catch(this.onError);
  }
}

export const SILENT = { notify: (): void => {} };
