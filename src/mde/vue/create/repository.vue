<template>
    <label class="label-context" for="repository-url">Repository URL:</label>
    <input
        id="repository-url"
        name="repository-url"
        type="text"
        v-model="modelValue.url"
        placeholder="ex: https://github.com/aws/aws-toolkit-vscode"
        @input="update('url', $event.target.value)"
    />
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { createClass } from '../../../webviews/util'

export const VueModel = createClass({ url: '', error: '' })

export default defineComponent({
    name: 'repository-url',
    props: {
        modelValue: {
            type: VueModel,
            default: new VueModel(),
        },
    },
    methods: {
        update(key: keyof InstanceType<typeof VueModel>, value: string) {
            this.$emit('update:modelValue', { ...this.modelValue, [key]: value })
        },
    },
})
</script>

<style>
#repository-url {
    width: 300px;
}
</style>
