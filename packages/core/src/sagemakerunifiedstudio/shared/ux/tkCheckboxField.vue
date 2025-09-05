<script setup lang="ts">
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TkCheckboxField Component
 *
 * A styled checkbox component with label.
 * Emits updates via `update:value` event when toggled.
 *
 * ### Props
 * @prop {string} id - The unique ID for the checkbox. Used to associate the input and label.
 * @prop {string} label - The label text displayed beside the checkbox.
 * @prop {boolean} [value=false] - Whether the checkbox is checked.
 *
 * ### Emits
 * @event update:value - Emitted when the checkbox is toggled. Emits the new boolean value.
 *
 * ### Example Usage
 * ```vue
 * <tk-checkbox-field
 *   id="agree"
 *   label="I agree to terms"
 *   v-model:value="form.agreed"
 * />
 * ```
 */

import TkSpaceBetween from './tkSpaceBetween.vue'

//-------------------------------------------------------------------------------------------------
// Props
//-------------------------------------------------------------------------------------------------
interface Props {
    id: string
    label: string
    value?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    value: false,
})

//-------------------------------------------------------------------------------------------------
// Emitted Events
//-------------------------------------------------------------------------------------------------
const emit = defineEmits<{
    (e: 'update:value', value: boolean): void
}>()
</script>

<template>
    <tk-space-between direction="horizontal" size="xs">
        <input
            class="tk-checkbox-field-input"
            type="checkbox"
            :id="props.id"
            :checked="props.value"
            @input="emit('update:value', ($event.target as HTMLInputElement).checked)"
        />
        <label class="tk-checkbox-field-label" :for="props.id">{{ props.label }}</label>
    </tk-space-between>
</template>

<style scoped>
.tk-checkbox-field-input,
.tk-checkbox-field-label {
    cursor: pointer;
}
</style>
