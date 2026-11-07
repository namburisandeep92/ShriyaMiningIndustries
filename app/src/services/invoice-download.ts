export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function printInvoice(html: string, fileName: string): Promise<void> {
  const frame = document.createElement('iframe')
  frame.title = 'Invoice print document'
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  const ready = new Promise<void>((resolve, reject) => {
    frame.onload = () => resolve()
    frame.onerror = () => reject(new Error('Unable to load invoice print document'))
  })
  frame.srcdoc = html
  document.body.appendChild(frame)
  const oldTitle = document.title
  const cleanup = () => { document.title = oldTitle; frame.remove() }
  try {
    await ready
    if (!frame.contentWindow || !frame.contentDocument) throw new Error('Invoice print window unavailable')
    document.title = fileName
    frame.contentDocument.title = fileName
    frame.contentWindow.addEventListener('afterprint', cleanup, { once: true })
    frame.contentWindow.focus()
    frame.contentWindow.print()
    setTimeout(cleanup, 60000)
  } catch (error) {
    cleanup()
    throw error
  }
}
