<template>
    <div>
        <div id="compute-grid">
            <div id="mde-size" style="grid-area: size">
                <span class="label-context soft">Size</span>
                <b>{{ instance.name }}</b
                ><br />
                {{ instance.specs }} 64GB ephemeral storage
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
import { PersistentStorageConfiguration } from '../../../types/clientmde'
import { DEFAULT_COMPUTE_SETTINGS } from '../constants'
import { InstanceType, SettingsForm } from '../wizards/environmentSettings'

declare const vscode: WebviewApi<VueModel>

class VueModel implements SettingsForm {
    inactivityTimeoutMinutes?: number | undefined
    instanceType!: InstanceType
    persistentStorage!: PersistentStorageConfiguration
}

export default defineComponent({
    name: 'compute-panel',
    props: {
        modelValue: VueModel,
    },
    computed: {
        instance() {
            const type = this.modelValue?.instanceType ?? DEFAULT_COMPUTE_SETTINGS.instanceType
            const desc = {
                name: type as string,
                specs: ``,
            }
            desc.name = type === DEFAULT_COMPUTE_SETTINGS.instanceType ? `${desc.name} (default)` : desc.name
            return desc
        },
        timeout() {
            const time = this.modelValue?.inactivityTimeoutMinutes ?? DEFAULT_COMPUTE_SETTINGS.inactivityTimeoutMinutes
            const timeDesc = `${time} mins`
            return time === DEFAULT_COMPUTE_SETTINGS.inactivityTimeoutMinutes ? `${timeDesc} (default)` : timeDesc
        },
    },
    methods: {
        emitEdit() {
            this.$emit('editSettings', this.modelValue ?? DEFAULT_COMPUTE_SETTINGS)
        },
    },
    emits: {
        editSettings: (current: SettingsForm) => current !== undefined,
    },
    created() {},
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
