/** The plain name of a source dataset, so planners never read a slug such as "public-trees". */
export function datasetName(id: string, names: Readonly<Record<string, string>>): string {
  return names[id] ?? id.replaceAll('-', ' ');
}
