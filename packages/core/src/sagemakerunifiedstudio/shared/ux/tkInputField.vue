<script setup lang="ts">
/**
 * TkInputField Component
 *
 * A reusable input field component that supports labels, descriptions, validation messages, and optional read-only mode.
 * This component emits `update:value` when the input is modified.
 *
 * ### Props
 * @prop {'text' | 'number'} [type='text'] - The input type (either `'text'` or `'number'`).
 * @prop {string} label - The label displayed above the input field.
 * @prop {string | number} [value=''] - The value bound to the input.
 * @prop {string} [description=''] - Optional descriptive text shown below the label.
 * @prop {boolean} [optional=false] - If true, marks the field as optional (used in the label display).
 * @prop {boolean} [readOnly=false] - If true, renders the input as non-editable.
 * @prop {string} [validationMessage=''] - Message shown below the input, typically used to display validation feedback.
 *
 * ### Emits
 * @event update:value - Emitted when the input value changes. Emits the updated value (`string | number`).
 *
 * ### Example Usage
 * ```vue
 * <tk-input-field
 *   label="First Name"
 *   v-model:value="form.firstName"
 *   description="Enter your legal first name."
 *   :optional="true"
 *   validation-message="This field is required"
 * />
 * ```
 */

import TkSpaceBetween from './tkSpaceBetween.vue'
import TkBox from './tkBox.vue'
import TkLabel from './tkLabel.vue'

interface Props {
    type?: 'text' | 'number'
    label: string
    value?: string | number
    description?: string
    optional?: boolean
    readOnly?: boolean
    validationMessage?: string
}

const props = withDefaults(defineProps<Props>(), {
    type: 'text',
    value: '',
    description: '',
    optional: false,
    readOnly: false,
    validationMessage: '',
})

const emit = defineEmits<{
    (e: 'update:value', value: string | number): void
}>()
</script>

<template>
    <tk-space-between size="xs">
        <tk-space-between size="xxxs">
            <tk-label :text="props.label" :optional="props.optional" />
            <div v-if="props.description.length > 0" class="tk-input-field-description">{{ props.description }}</div>
        </tk-space-between>

        <tk-space-between :class="props.validationMessage.length > 0 ? 'input-error' : ''" size="xxs">
            <tk-box>
                <input
                    class="tk-width-full"
                    :class="props.readOnly ? 'tk-input-field-readonly' : ''"
                    :type="props.type"
                    :value="props.value"
                    :readonly="props.readOnly"
                    @input="emit('update:value', ($event.target as HTMLInputElement).value)"
                />
            </tk-box>
            <span>{{ props.validationMessage }}</span>
        </tk-space-between>
    </tk-space-between>
</template>

<style scoped>
.tk-input-field-description {
    font-size: var(--tk-font-size-small);
}

.tk-input-field-readonly {
    background: transparent;
    border: 0px;
    outline: none;
    padding-left: 0;
}
</style>
