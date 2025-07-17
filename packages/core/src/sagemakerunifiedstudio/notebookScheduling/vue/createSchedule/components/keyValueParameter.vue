<script setup lang="ts">
import { reactive, computed } from 'vue'

interface Props {
    id: number
}

const props = withDefaults(defineProps<Props>(), {})

const emit = defineEmits<{
    (e: 'change', id: number, error: boolean, name: string, value: string): void
    (e: 'remove', id: number): void
}>()

interface State {
    parameterName: string
    parameterNameErrorMessage: string
    parameterValue: string
    parameterValueErrorMessage: string
}

const state: State = reactive({
    parameterName: '',
    parameterNameErrorMessage: 'No name specified for parameter.',
    parameterValue: '',
    parameterValueErrorMessage: 'No value specified for parameter.',
})

const parameterNameErrorClass = computed(() => {
    emit(
        'change',
        props.id,
        state.parameterName.length === 0 || state.parameterValue.length === 0,
        state.parameterName,
        state.parameterValue
    )
    return state.parameterName.length > 0 ? '' : 'input-error'
})

const parameterValueErrorClass = computed(() => {
    emit(
        'change',
        props.id,
        state.parameterName.length === 0 || state.parameterValue.length === 0,
        state.parameterName,
        state.parameterValue
    )
    return state.parameterValue.length > 0 ? '' : 'input-error'
})
</script>

<template>
    <div class="key-value-parameter">
        <div class="key-value-parameter-input-container" :class="parameterNameErrorClass">
            <input type="text" v-model="state.parameterName" />
            <div>{{ state.parameterNameErrorMessage }}</div>
        </div>
        <div class="key-value-parameter-input-container" :class="parameterValueErrorClass">
            <input type="text" v-model="state.parameterValue" />
            <div>{{ state.parameterValueErrorMessage }}</div>
        </div>
        <div>
            <button class="key-value-parameter-remove" @click="emit('remove', props.id)">&#10761;</button>
        </div>
    </div>
</template>

<style scoped>
.key-value-parameter {
    column-gap: 5px;
    display: grid;
    grid-template-columns: 1fr 1fr auto;
}

.key-value-parameter-input-container {
    display: flex;
    flex-direction: column;
}

.key-value-parameter-input-container > div {
    display: none;
}

.key-value-parameter-input-container.input-error {
    color: var(--tk-inputValidation-errorBorder);
    font-size: var(--tk-font-size-small);
}

.key-value-parameter-input-container.input-error > input {
    outline-color: var(--tk-inputValidation-errorBorder);
    outline-offset: -1px;
    outline-style: solid;
    outline-width: 1px;
}

.key-value-parameter-input-container.input-error > div {
    display: block;
}

.key-value-parameter-remove {
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
}

.key-value-parameter-remove:focus {
    outline: none;
}
</style>
