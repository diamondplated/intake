// The projects people can file against. Edit this list and redeploy.
// `id` goes in the form, `name` is what people see, `repo` is where the issue lands.
export const PROJECTS = [
  { id: 'peach', name: 'Peach', repo: 'diamondplated/peach' },
  { id: 'aura', name: 'Aura', repo: 'diamondplated/aura' },
  { id: 'cove-android', name: 'Cove (Android)', repo: 'diamondplated/cove-android' },
  { id: 'mise', name: 'Mise', repo: 'diamondplated/mise' },
  { id: 'latent', name: 'Latent', repo: 'diamondplated/latent' },
  { id: 'sift', name: 'Sift', repo: 'diamondplated/sift' },
];

// Labels added to every issue, plus one per kind.
export const BASE_LABELS = ['from-intake'];
export const KIND_LABELS = { bug: 'bug', feature: 'enhancement' };

// Branch in each target repo that holds uploaded screenshots.
export const SCREENSHOT_BRANCH = 'intake-screenshots';

export const MAX_SCREENSHOTS = 6;
export const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
