import { createElement, type ComponentProps } from 'react';
import { DealExplorer as Viewer } from '@valet/deal-viewer';
import type { Result } from '../lib/model';
export { BoardInformation } from '@valet/deal-viewer';
export function DealExplorer({ boardResults = [], ...props }: ComponentProps<typeof Viewer> & { boardResults?: Result[] }) {
  const miniBridge = props.result ? !!props.result.miniBridge : boardResults.some(r => r.miniBridge || r.split?.ns.miniBridge || r.split?.ew.miniBridge);
  return createElement(Viewer, { ...props, miniBridge });
}
