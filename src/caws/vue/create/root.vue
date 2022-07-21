<template>
    <div id="configure-header">
        <h1>Create a REMOVED.codes workspace</h1>
        <!--TODO: add link-->
        <span>
            Create an on-demand AWS instance to work on your code in the cloud.
            <a>Learn more about REMOVED.codes workspaces.</a>
        </span>
    </div>

    <settings-panel id="source-panel" title="Source Code">
        <source-panel v-model="source"></source-panel>
    </settings-panel>
    <settings-panel
        id="alias-panel"
        title="Alias"
        description="Enter an alias to identify the workspace. This is optional but recommended."
    >
        <label class="options-label soft" style="display: block" for="alias-input">Alias</label>
        <input id="alias-input" type="text" v-model="alias" />
    </settings-panel>

    <settings-panel
        id="configuration-panel"
        title="Configuration"
        description="All settings except Storage can be changed in settings after creation."
    >
        <compute-panel v-model="compute" type="configure" @edit-settings="editCompute"></compute-panel>
    </settings-panel>

    <div id="submit-buttons" class="mb-16">
        <button class="button-theme-secondary" @click="cancel" :disabled="creating">Cancel</button>

        <button @click="submit" :disabled="!canCreate">
            {{ creating ? 'Creating...' : 'Create Workspace' }}
        </button>
    </div>
</template>

<script lang="ts">
import computePanel, { VueModel as ComputeModel } from '../compute.vue'
import sourcePanel, { VueModel as SourceModel } from './source.vue'
import settingsPanel from '../../../webviews/components/settingsPanel.vue'
import { defineComponent } from 'vue'
import { CawsCreateWebview } from './backend'
import { WebviewClientFactory } from '../../../webviews/client'
import saveData from '../../../webviews/mixins/saveData'
import { WorkspaceSettings } from '../../commands'

const client = WebviewClientFactory.create<CawsCreateWebview>()

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
            // Not supported yet
            if (this.source.mode === 'empty') {
                return false
            }

            return this.source.selectedBranch && this.source.selectedProject && !this.creating
        },
    },
    created() {},
    methods: {
        async editCompute(key: keyof WorkspaceSettings) {
            const current = { ...this.compute, alias: this.alias }
            const resp = await client.editSetting(current, key)

            if (key !== 'alias') {
                this.compute = new ComputeModel(resp)
            } else if (resp.alias !== undefined) {
                this.alias = resp.alias
            }
        },
        async submit() {
            if (!this.source.selectedBranch || !this.source.selectedProject) {
                return
            }

            this.creating = true
            try {
                const settings = { ...this.compute, alias: this.alias }
                await client.submit(settings, this.source.selectedProject, this.source.selectedBranch)
                client.close()
            } catch {
                client.showLogsMessage('Failed to create workspace')
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
