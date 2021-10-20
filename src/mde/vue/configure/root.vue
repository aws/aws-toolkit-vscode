<template>
    <h2>Environment Settings for {{ details.id }}</h2>
    <a>More info</a>
    <settings-panel id="summary-panel" title="Details">
        <summary-panel v-model="details"></summary-panel>
    </settings-panel>
    <settings-panel
        id="dev-file-panel"
        title="DevFile"
        description="Contains the definition to build your application libraries and toolchain. Can be updated later in your IDE."
    >
        <definition-file v-model="definitionFile"></definition-file>
    </settings-panel>
    <settings-panel
        id="tags-and-labels-panel"
        title="Tags and labels"
        description="Use tags (key and value) to track resources and costs. Use labels (key only) to identify your environment."
    >
        <tags-panel v-model="tags"></tags-panel>
    </settings-panel>
    <settings-panel
        id="compute-settings-panel"
        vscode-id=""
        title="Compute settings"
        description="All settings except EBS Volume can be modified in settings after creation."
    >
        <compute-panel v-model="compute" @edit-settings="editCompute"></compute-panel>
    </settings-panel>
</template>

<script lang="ts">
import summaryPanel, { VueModel as EnvironmentDetailsModel } from '../summary.vue'
import definitionFile, { VueModel as DevFileModel } from '../definitionFile.vue'
import tagsPanel, { VueModel as TagsModel } from '../tags.vue'
import computePanel, { VueModel as ComputeModel } from '../compute.vue'
import settingsPanel from '../../../webviews/components/settingsPanel.vue'
import { defineComponent } from 'vue'
import { Commands } from './backend'
import { WebviewClientFactory } from '../../../webviews/client'
import { SettingsForm } from '../../wizards/environmentSettings'
import saveData from '../../../webviews/mixins/saveData'

const client = WebviewClientFactory.create<Commands>()

const model = {
    details: new EnvironmentDetailsModel({}),
    definitionFile: new DevFileModel(),
    tags: new TagsModel(),
    compute: new ComputeModel(),
}

// key design ideas:
// 1. only store state in a component if there is no two-way communication between parent/child
// 2. if there is two-way communication, store state in the parent
// 3. children can act independently to update their own models
export default defineComponent({
    name: 'configure',
    components: {
        definitionFile,
        tagsPanel,
        settingsPanel,
        computePanel,
        summaryPanel,
    },
    mixins: [saveData],
    data() {
        return model
    },
    created() {
        client.init().then(s => {
            this.details = s
            this.compute = s as any
            const tags = [] as any[]
            Object.keys(s.tags ?? {}).forEach(k => {
                tags.push({ key: k, value: (s.tags ?? {})[k] })
            })
            this.tags.tags = tags
        })
    },
    methods: {
        editCompute(current: SettingsForm) {
            client.editSettings(current).then(settings => {
                this.compute = settings ?? this.compute
            })
        },
        isValid() {
            // TODO: just have components emit an 'error' event to notifiy containers that they should not submit
            // we should also just provide the offending element id so we can link to it
            return !this.tags.tags
                .map(({ keyError, valueError }) => keyError || valueError)
                .reduce((a, b) => a || b, '')
        },
    },
})
</script>

<style scoped>
html {
    overflow-y: scroll;
}
/* Default padding is 20x, this gives space for the scrollbar which is 8px wide */
body {
    padding-right: 12px;
}
.flex-right {
    display: flex;
    justify-content: flex-end;
}
</style>
