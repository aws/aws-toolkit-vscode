<script setup lang="ts">
/**
 * TkSelectField Component
 *
 * A customizable select dropdown component that supports labels, descriptions, and a list of options.
 * Emits an `update:value` event when the selected option changes.
 *
 * ### Props
 * @prop {string} label - The label displayed above the select dropdown.
 * @prop {string} [description=''] - Optional helper text shown below the label.
 * @prop {string} [selected=''] - The currently selected option value. Defaults to the first option if not provided.
 * @prop {Option[]} [options=[]] - Array of selectable options, where each option has a `text` and `value` field.
 * @prop {boolean} [optional=false] - If true, marks the field as optional (used in label display).
 *
 * ### Emits
 * @event update:value - Emitted when the user selects a new option. Emits the selected `value` as a string.
 *
 * ### Example Usage
 * ```vue
 * <tk-select-field
 *   label="Choose a color"
 *   description="This will set your theme color."
 *   :options="[
 *     { text: 'Red', value: 'red' },
 *     { text: 'Blue', value: 'blue' },
 *     { text: 'Green', value: 'green' }
 *   ]"
 *   :selected="form.color"
 *   @update:value="form.color = $event"
 * />
 * ```
 */

import { computed } from 'vue'
import TkSpaceBetween from './tkSpaceBetween.vue'
import TkLabel from './tkLabel.vue'

export interface Option {
    text: string
    value: string
}

interface Props {
    label: string
    description?: string
    selected?: string
    options?: Option[]
    optional?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    description: '',
    selected: '',
    options: () => [],
    optional: false,
})

const emit = defineEmits<{
    (e: 'update:value', value: string): void
}>()

const selectedValue = computed(() => {
    if (props.selected.length > 0) {
        return props.selected
    }

    if (props.options.length > 0) {
        return props.options[0].value
    }

    return undefined
})
</script>

<template>
    <tk-space-between size="xs">
        <tk-space-between size="xxxs">
            <tk-label :text="props.label" :optional="props.optional" />
            <div v-if="props.description.length > 0" class="tk-select-field-description">{{ props.description }}</div>
        </tk-space-between>

        <select
            class="tk-select-field-select"
            :value="selectedValue"
            @input="emit('update:value', ($event.target as HTMLSelectElement).value)"
        >
            <option v-for="option in props.options" :value="option.value">{{ option.text }}</option>
        </select>
    </tk-space-between>
</template>

<style scoped>
.tk-select-field-description {
    font-size: var(--tk-font-size-small);
}

.tk-select-field-select {
    cursor: pointer;
}
</style>
