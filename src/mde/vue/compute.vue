<template>
    <div>
        <div id="compute-grid">
            <div id="mde-size" style="grid-area: size">
                <span class="label-context soft">Size</span>
                <b>{{ instance.name }}</b
                ><br />
                {{ instance.specs }}
            </div>
            <div id="timeout-length" style="grid-area: timeout">
                <span class="label-context soft">Timeout length</span>
                <b>{{ timeout }}</b>
            </div>
            <div id="ebs-volume" style="grid-area: volume">
                <span class="label-context soft">EBS Volume</span>
                <b>5 GB (default)</b>
            </div>
        </div>
        <button id="edit-compute-settings" class="button-size button-theme-secondary" type="button" @click="emitEdit">
            Edit settings
        </button>
    </div>
</template>

<script lang="ts">
import { WebviewApi } from 'vscode-webview'
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../webviews/client'
import saveData from '../../webviews/mixins/saveData'
import { createClass } from '../../webviews/util'
import { DEFAULT_COMPUTE_SETTINGS } from '../constants'
import { SettingsForm } from '../wizards/environmentSettings'
import { Commands } from './create/backend'

declare const vscode: WebviewApi<typeof VueModel>
const client = WebviewClientFactory.create<Commands>()

export const VueModel = createClass(DEFAULT_COMPUTE_SETTINGS)

export default defineComponent({
    name: 'compute-panel',
    props: {
        modelValue: {
            type: VueModel,
            default: new VueModel(),
        },
    },
    data() {
        return {
            descriptions: {} as Record<string, { name: string; specs: string } | undefined>,
        }
    },
    mixins: [saveData],
    created() {
        client.getAllInstanceDescriptions().then(desc => (this.descriptions = desc))
    },
    computed: {
        instance() {
            const type = this.modelValue.instanceType
            const desc = this.descriptions[type] ? { ...this.descriptions[type] } : { name: '', specs: '' }
            desc.name = type === DEFAULT_COMPUTE_SETTINGS.instanceType ? `${desc.name} (default)` : desc.name
            return desc
        },
        timeout() {
            const time = this.modelValue.inactivityTimeoutMinutes
            const timeDesc = `${time} mins`
            return time === DEFAULT_COMPUTE_SETTINGS.inactivityTimeoutMinutes ? `${timeDesc} (default)` : timeDesc
        },
    },
    methods: {
        emitEdit() {
            this.$emit('editSettings', this.modelValue)
        },
    },
    emits: {
        editSettings: (current: SettingsForm) => current !== undefined,
    },
})
</script>

<style scoped>
#compute-grid {
    display: grid;
    justify-content: left;
    grid-template-areas:
        'size size .'
        'timeout . volume';
    gap: 16px 24px;
}
#edit-compute-settings {
    margin-top: 16px;
}
</style>
