<script setup lang="ts">
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TkIconButton component
 *
 * A reusable, accessible icon button component that emits a `clicked` event when clicked.
 *
 * ### Emits
 * @event clicked - Emitted when the button is clicked.
 *
 * ### Example Usage
 * ```vue
 * <tk-icon-button @clicked="handleClick">
 *   <download-icon />
 * </tk-icon-button>
 * ```
 */

const emit = defineEmits<{
    (e: 'clicked'): void
}>()
</script>

<template>
    <div role="button" class="icon-button" @click="emit('clicked')">
        <slot />
    </div>
</template>

<style scoped>
.icon-button {
    cursor: pointer;
    display: inline;
}
</style>
