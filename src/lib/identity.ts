import { validateDataset, type Dataset } from './model';
// Opaque keys survive anonymization; labels and display IDs are not identities.
export function withIdentity(data: Dataset): Dataset {
  return validateDataset({ ...data,
    boards: data.boards.map(b => ({ ...b, originKey: b.originKey ?? crypto.randomUUID() })),
    results: data.results.map(r => ({ ...r, originKey: r.originKey ?? crypto.randomUUID() })),
  });
}
