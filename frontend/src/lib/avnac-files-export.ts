import { idbGetEditorRecord } from './avnac-editor-idb'

export function safeAvnacFileBaseName(name: string): string {
  const t = name.trim() || 'untitled'
  const s = t
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80)
  return s || 'untitled'
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const u = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = u
  a.download = fileName
  a.click()
  URL.revokeObjectURL(u)
}

export async function downloadAvnacJsonForId(id: string): Promise<boolean> {
  const record = await idbGetEditorRecord(id)
  if (!record) return false
  const blob = new Blob([JSON.stringify(record.document, null, 2)], {
    type: 'application/json',
  })
  downloadBlob(blob, `${safeAvnacFileBaseName(record.name ?? 'Untitled')}.avnac.json`)
  return true
}
