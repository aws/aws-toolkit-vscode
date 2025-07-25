<script setup lang="ts">
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TkRadioField Component
 *
 * A custom-styled radio button component that emits a `update:value` event when selected.
 * It is designed to work as part of a radio group using shared `selectedValue`.
 *
 * ### Props
 * @prop {string} id - The unique identifier for the radio input, used for associating with the label.
 * @prop {string} label - The text displayed next to the radio button.
 * @prop {string} [value=''] - The value assigned to this specific radio input.
 * @prop {string} [selectedValue=''] - The currently selected value in the radio group. Used to determine if this radio should be checked.
 *
 * ### Emits
 * @event update:value - Emitted when this radio button is selected. Emits its `value` as a string.
 *
 * ### Example Usage
 * ```vue
 * <tk-radio-field
 *   id="color-red"
 *   label="Red"
 *   value="red"
 *   :selectedValue="form.favoriteColor"
 *   @update:value="form.favoriteColor = $event"
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
    value?: string
    selectedValue?: string
}

const props = withDefaults(defineProps<Props>(), {
    value: '',
    selectedValue: '',
})

//-------------------------------------------------------------------------------------------------
// Emitted Events
//-------------------------------------------------------------------------------------------------
const emit = defineEmits<{
    (e: 'update:value', value: string): void
}>()
</script>

<template>
    <tk-space-between direction="horizontal" size="xs">
        <input
            class="tk-radio-field-input"
            type="radio"
            :id="props.id"
            :value="props.value"
            :checked="props.selectedValue === props.value"
            @input="emit('update:value', ($event.target as HTMLInputElement).value)"
        />
        <label class="tk-radio-field-label" :for="props.id">{{ props.label }}</label>
    </tk-space-between>
</template>

<style scoped>
.tk-radio-field-input,
.tk-radio-field-label {
    cursor: pointer;
}
</style>
