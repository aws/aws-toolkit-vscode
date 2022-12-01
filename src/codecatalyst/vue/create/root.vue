<template>
    <div id="configure-header">
        <h1>Create a CodeCatalyst Dev Environment</h1>
        <!--TODO: add link-->
        <span style="font-size: 0.95em">
            Create an on-demand AWS instance to work on your code in the cloud.
            <a href="https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/codecatalyst-devenvironment.html">
                Learn more about CodeCatalyst Dev Environments.
            </a>
        </span>
    </div>

    <settings-panel id="source-panel" title="Source Code">
        <source-panel v-model="source"></source-panel>
    </settings-panel>
    <settings-panel
        id="alias-panel"
        title="Alias"
        description="Enter an alias to identify the Dev Environment. (Optional but recommended)"
    >
        <label class="options-label soft mb-8" style="display: block" for="alias-input">Alias</label>
        <input id="alias-input" type="text" v-model="alias" />
    </settings-panel>

    <settings-panel
        id="configuration-panel"
        title="Dev Environment Configuration"
        description="All settings except Storage can be changed in settings after creation."
    >
        <compute-panel v-model="compute" mode="create" @edit-settings="editCompute"></compute-panel>
    </settings-panel>

    <div id="submit-buttons" class="mb-16">
        <button class="button-theme-secondary" @click="cancel" :disabled="creating">Cancel</button>

        <button @click="submit" :disabled="!canCreate">
            {{ creating ? 'Creating...' : 'Create Dev Environment' }}
        </button>
    </div>
</template>

<script lang="ts">
import computePanel, { VueModel as ComputeModel } from '../compute.vue'
import sourcePanel, { isValidSource, VueModel as SourceModel } from './source.vue'
import settingsPanel from '../../../webviews/components/settingsPanel.vue'
import { defineComponent } from 'vue'
import { CodeCatalystCreateWebview } from './backend'
import { WebviewClientFactory } from '../../../webviews/client'
import saveData from '../../../webviews/mixins/saveData'
import { DevEnvironmentSettings } from '../../commands'

const client = WebviewClientFactory.create<CodeCatalystCreateWebview>()

const model = {
    source: new SourceModel(),
    compute: new ComputeModel(),
    creating: false,
    alias: '',
}

export default defineComponent({
    name: 'create',
    components: {
        settingsPanel,
        computePanel,
        sourcePanel,
    },
    mixins: [saveData],
    data() {
        return model
    },
    computed: {
        canCreate() {
            return !this.creating && isValidSource(this.source)
        },
    },
    created() {},
    watch: {
        'source.selectedProject'() {
            this.compute = new ComputeModel()
        },
    },
    methods: {
        async editCompute(key: keyof DevEnvironmentSettings) {
            const current = { ...this.compute, alias: this.alias }
            const resp = await client.editSetting(current, key, this.source.selectedProject?.org)

            if (key !== 'alias') {
                this.compute = new ComputeModel(resp)
            } else if (resp.alias !== undefined) {
                this.alias = resp.alias
            }
        },
        async submit() {
            if (!this.canCreate || !isValidSource(this.source)) {
                return
            }

            this.creating = true
            try {
                const settings = { ...this.compute, alias: this.alias }
                await client.submit(settings, this.source)
                client.close()
            } catch (err) {
                if (!(err as Error).message.match(/cancelled/i)) {
                    client.showLogsMessage(`Failed to create Dev Environment: ${(err as Error).message}`)
                }
            } finally {
                this.creating = false
            }
        },
        cancel() {
            client.close()
        },
    },
})
</script>

<style>
html {
    overflow-y: scroll;
}
body {
    padding-right: 12px;
    max-width: 700px;
}
</style>

<style scoped>
#configure-header {
    padding: 16px 0 0 0;
    background-color: var(--vscode-editor-background);
    z-index: 1;
    position: relative;
}
#alias-input {
    min-width: 300px;
}
#submit-buttons {
    display: flex;
    justify-content: end;
    column-gap: 16px;
}
</style>
