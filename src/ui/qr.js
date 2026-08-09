import qrcode from 'qrcode-generator';

export function renderQrSvg(value, { margin = 4 } = {}) {
    const text = String(value || '');
    if (!text || text.length > 4096) throw new Error('QR content must contain between 1 and 4096 characters');

    const qr = qrcode(0, 'M');
    qr.addData(text, 'Byte');
    qr.make();

    const size = qr.getModuleCount();
    const dimension = size + margin * 2;
    const paths = [];
    for (let row = 0; row < size; row += 1) {
        for (let column = 0; column < size; column += 1) {
            if (qr.isDark(row, column)) paths.push(`M${column + margin} ${row + margin}h1v1h-1z`);
        }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" role="img" aria-label="QR code" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${paths.join('')}" fill="#101828"/></svg>`;
}
