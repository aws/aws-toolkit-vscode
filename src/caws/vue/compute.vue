<template>
    <div>
        <div id="compute-grid">
            <div id="size" style="grid-area: size">
                <div>
                    <span class="label-context soft">Size</span>
                    <b>{{ instance.name }}</b
                    ><br />
                    {{ instance.specs }}
                </div>
                <button
                    type="button"
                    id="edit-size"
                    class="button-theme-secondary mt-8"
                    @click="$emit('editSettings', 'instanceType')"
                >
                    Edit Size
                </button>
            </div>
            <div id="timeout" style="grid-area: timeout">
                <div>
                    <span class="label-context soft">Timeout length</span>
                    <b>{{ timeout }}</b>
                </div>
                <button
                    type="button"
                    id="edit-timeout"
                    class="button-theme-secondary mt-8"
                    @click="$emit('editSettings', 'inactivityTimeoutMinutes')"
                >
                    Edit Timeout Length
                </button>
            </div>
            <div id="vpc" style="grid-area: vpc">
                <span class="label-context soft">VPC Connections</span>
                <b>None</b>
                <p class="mt-0 mb-0">{{ readonlyText }}</p>
            </div>
            <div id="volume" style="grid-area: volume">
                <span class="label-context soft">EBS Volume</span>
                <b>{{ storage }}</b>
                <p class="mt-0 mb-0">{{ readonlyText }}</p>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../webviews/client'
import saveData from '../../webviews/mixins/saveData'
import { createClass, createType } from '../../webviews/util'
import { WorkspaceSettings } from '../commands'
import { CawsConfigureWebview } from './configure/backend'
import { CawsCreateWebview } from './create/backend'

const client = WebviewClientFactory.create<CawsConfigureWebview | CawsCreateWebview>()

const DEFAULT_COMPUTE_SETTINGS = {
    inactivityTimeoutMinutes: 30,
    instanceType: 'dev.standard1.medium',
    persistentStorage: { sizeInGiB: 16 },
}

export const VueModel = createClass(DEFAULT_COMPUTE_SETTINGS)

export default defineComponent({
    name: 'compute-panel',
    props: {
        modelValue: {
            type: createType(VueModel),
            default: new VueModel(),
        },
    },
    data() {
        return {
            readonlyText: "Can't be changed after creation.",
            descriptions: {} as Record<string, { name: string; specs: string } | undefined>,
        }
    },
    mixins: [saveData],
    created() {
        client.getAllInstanceDescriptions().then(desc => (this.descriptions = desc))
    },
    computed: {
        value() {
            return this.modelValue
        },
        instance() {
            const type = this.value.instanceType
            const desc = this.descriptions[type] ? { ...this.descriptions[type] } : { name: '', specs: '' }
            desc.name = type === DEFAULT_COMPUTE_SETTINGS.instanceType ? `${desc.name} (default)` : desc.name
            return desc
        },
        timeout() {
            const time = this.value.inactivityTimeoutMinutes
            const timeDesc = `${time} mins`
            return time === DEFAULT_COMPUTE_SETTINGS.inactivityTimeoutMinutes ? `${timeDesc} (default)` : timeDesc
        },
        storage() {
            const storage = this.value.persistentStorage.sizeInGiB
            const storageDesc = `${storage} GiB`
            return storage === DEFAULT_COMPUTE_SETTINGS.persistentStorage.sizeInGiB
                ? `${storageDesc} (default)`
                : storageDesc
        },
    },
    emits: {
        editSettings: (key: keyof WorkspaceSettings) => key !== undefined,
    },
})
</script>

<style scoped>
#compute-grid {
    display: grid;
    justify-content: left;
    grid-template-areas:
        'size vpc'
        'timeout volume';
    gap: 16px 24px;
}
#edit-compute-settings {
    margin-top: 16px;
}
</style>
