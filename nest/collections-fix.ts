// Preload script to fix collections library conflict
// Must run BEFORE any module that imports excel-export

// Save native Array.from before collections library overwrites it
const _nativeArrayFrom = Array.from;

// Override the broken shim
if (typeof Array.from !== 'undefined') {
    Object.defineProperty(Array, 'from', {
        value: function(arrayLike: any) {
            if (_nativeArrayFrom) {
                return _nativeArrayFrom.call(Array, arrayLike);
            }
            // Fallback implementation
            const result = [];
            for (let i = 0; i < arrayLike.length; i++) {
                result.push(arrayLike[i]);
            }
            return result;
        },
        writable: true,
        configurable: true
    });
}

console.log('✓ Collections library patch applied');
