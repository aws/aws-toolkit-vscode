<template>
    <div class="wrapper">
        <slot name="input-slot" :update-error="updateError" :data-invalid="isInvalid"></slot>
        <slot name="error-message" v-if="isInvalid" :error="modelValue?.error"></slot>
        <slot name="placeholder" v-else></slot>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

// TODO: this component is not being used at all, though I think it would be worth investing time into it
// TODO: just make this component have an input box + error box self-contained w/ relevant validation callbacks
// it can also emit 'error' events and what not

class Model {
    error?: string
}

export default defineComponent({
    name: 'validated-input',
    props: {
        modelValue: Model,
    },
    computed: {
        isInvalid() {
            return this.modelValue?.error !== undefined
        },
    },
    methods: {
        updateError(error?: string) {
            this.$emit('update:modelValue', { ...this.modelValue, error })
        },
    },
})
</script>
