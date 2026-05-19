/**
 * Resuelve referencias conversacionales:
 * "la misma"
 * "otro igual"
 * "el primero"
 * etc.
 */

export function resolveContextReference({
    text,
    cart,
    menuMap = []
}) {

    const normalized = text.toLowerCase();

    // Último producto discutido
    const lastProduct =
        cart?.tempData?.lastProductDiscussed;

    // Productos actuales del carrito
    const cartItems =
        cart?.items || [];

    // =====================================================
    // REFERENCIAS A ÚLTIMO PRODUCTO
    // =====================================================

    const sameProductPatterns = [
        'la misma',
        'lo mismo',
        'igual',
        'otro igual',
        'la misma otra vez'
    ];

    const matchedSame =
        sameProductPatterns.some(
            pattern => normalized.includes(pattern)
        );

    if (matchedSame && lastProduct) {

        return {
            type: 'LAST_PRODUCT',
            productName: lastProduct
        };
    }

    // =====================================================
    // REFERENCIAS ORDINALES
    // =====================================================

    if (normalized.includes('el primero')) {

        if (cartItems[0]) {
            return {
                type: 'CART_POSITION',
                productName: cartItems[0].productName
            };
        }
    }

    if (normalized.includes('el segundo')) {

        if (cartItems[1]) {
            return {
                type: 'CART_POSITION',
                productName: cartItems[1].productName
            };
        }
    }

    return null;
}