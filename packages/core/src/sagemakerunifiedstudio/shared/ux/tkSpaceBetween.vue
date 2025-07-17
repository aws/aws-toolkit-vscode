<script setup lang="ts">
/**
 * TkSpaceBetween Component
 *
 * A layout utility component that adds consistent spacing between child elements,
 * either vertically or horizontally. Useful for creating predictable gaps in UIs
 * without needing to manually apply margins or padding.
 *
 * ### Props
 * @prop {'vertical' | 'horizontal'} [direction='vertical'] - Layout direction of children.
 * - `'vertical'` renders children top to bottom.
 * - `'horizontal'` renders children left to right with wrapping.
 *
 * @prop {'none' | 'xxxs' | 'xxs' | 'xs' | 's' | 'm' | 'l' | 'xl'} [size='m'] - The size of the gap between children.
 * - `none`: 0
 * - `xxxs`: 2px
 * - `xxs`: 4px
 * - `xs`: 8px
 * - `s`: 12px
 * - `m`: 16px (default)
 * - `l`: 20px
 * - `xl`: 24px
 *
 * ### Slots
 * @slot default - The child elements to be spaced apart.
 *
 * ### Example Usage
 * ```vue
 * <!-- Vertical spacing (default) -->
 * <tk-space-between>
 *   <div>Item 1</div>
 *   <div>Item 2</div>
 * </tk-space-between>
 *
 * <!-- Horizontal spacing -->
 * <tk-space-between direction="horizontal" size="s">
 *   <button>Yes</button>
 *   <button>No</button>
 * </tk-space-between>
 * ```
 */

import { computed } from 'vue'

interface Props {
    direction?: 'vertical' | 'horizontal'
    size?: 'none' | 'xxxs' | 'xxs' | 'xs' | 's' | 'm' | 'l' | 'xl'
}

const props = withDefaults(defineProps<Props>(), {
    direction: 'vertical',
    size: 'm',
})

/**
 * Returns gap value based on size prop.
 */
const gapValue = computed(() => {
    switch (props.size) {
        case 'xxxs':
            return '2px'
        case 'xxs':
            return '4px'
        case 'xs':
            return '8px'
        case 's':
            return '12px'
        case 'm':
            return '16px'
        case 'l':
            return '20px'
        case 'xl':
            return '24px'
        case 'none':
            return '0'
    }
})

/**
 * Returns css classes to apply.
 */
const classValue = computed(() => {
    const classes = ['tk-spacebetween']

    if (props.direction === 'horizontal') {
        classes.push('tk-spacebetween-horizontal')
    }

    return classes.join(' ')
})
</script>

<template>
    <div :class="classValue">
        <slot />
    </div>
</template>

<style scoped>
.tk-spacebetween {
    display: flex;
    flex-direction: column;
    row-gap: v-bind(gapValue);
}

.tk-spacebetween-horizontal {
    flex-direction: row;
    flex-wrap: wrap;
    gap: v-bind(gapValue);
}
</style>
