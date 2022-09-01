<template>
    <div id="configure-header">
        <h2 style="display: inline">Settings for {{ workspaceName }}</h2>
        <br />
    </div>
    <transition name="slide-down">
        <div id="restart-notification" class="notification" v-if="canRestart">
            <span id="notification-span">
                <span id="info-notification-icon" class="icon icon-lg icon-vscode-info"></span>
                <span>Restart your workspace to update with changes.</span>
            </span>
            <button
                id="restart-button"
                type="button"
                class="button-theme-primary ml-16"
                :disabled="restarting"
                @click="restart()"
            >
                {{ restarting ? 'Restarting...' : 'Restart' }}
            </button>
        </div>
    </transition>
    <settings-panel id="summary-panel" title="Details">
        <summary-panel v-model="details" @edit-settings="editCompute"></summary-panel>
    </settings-panel>
    <settings-panel
        id="dev-file-panel"
        title="Devfile"
        description="Contains the definition to build your application libraries and toolchain. You can change the currently 
        configured definition file."
    >
        <devfile-panel :file-path="definitionFilePath"></devfile-panel>
    </settings-panel>

    <settings-panel
        id="compute-settings-panel"
        title="Compute settings"
        description="All settings except VPC Connections and EBS Volume can be changed after creation."
    >
        <compute-panel v-model="compute" type="configure" @edit-settings="editCompute"></compute-panel>
    </settings-panel>
</template>

<script lang="ts">
import summaryPanel, { VueModel as WorkspaceDetailsModel } from '../summary.vue'
import computePanel, { VueModel as ComputeModel } from '../compute.vue'
import settingsPanel from '../../../webviews/components/settingsPanel.vue'
import devfilePanel from '../devfile.vue'
import { defineComponent } from 'vue'
import { CawsConfigureWebview } from './backend'
import { WebviewClientFactory } from '../../../webviews/client'
import saveData from '../../../webviews/mixins/saveData'
import { Status } from '../../../shared/clients/developmentWorkspaceClient'
import { WorkspaceSettings } from '../../commands'

const client = WebviewClientFactory.create<CawsConfigureWebview>()

const model = {
    details: new WorkspaceDetailsModel(),
    definitionFilePath: '',
    workspaceUrl: '',
    devfileStatus: 'STABLE' as Status,
    compute: new ComputeModel(),
    restarting: false,
    needsRestart: false,
    branchUrl: '',
}

export default defineComponent({
    name: 'configure',
    components: {
        settingsPanel,
        devfilePanel,
        computePanel,
        summaryPanel,
    },
    mixins: [saveData],
    data() {
        return model
    },
    computed: {
        workspaceName() {
            const alias = this.details.alias
            const branch = this.details.repositories[0]?.branchName

            return branch ? `${alias} (${branch})` : alias
        },
        canRestart() {
            return (this.needsRestart || this.devfileStatus === 'CHANGED') && this.details.status === 'RUNNING'
        },

        // TODO(sijaden): add `busy` and then bind it to all components so they can disable things
    },
    created() {
        client.init().then(env => {
            this.details = env ? new WorkspaceDetailsModel(env) : this.details
            this.compute = env ? new ComputeModel(env) : this.compute
        })

        client.onDidChangeDevfile(data => {
            this.devfileStatus = data.status ?? this.devfileStatus
        })

        if (!this.definitionFilePath) {
            client.getDevfileLocation().then(f => (this.definitionFilePath = f))
        }
    },
    methods: {
        async editCompute(key: keyof WorkspaceSettings) {
            const previous = this.compute[key as Exclude<typeof key, 'alias'>]
            const current = { ...this.compute, alias: this.details.alias }
            const resp = await client.editSetting(current, key)

            if (key !== 'alias') {
                this.needsRestart = this.needsRestart || previous !== resp[key]
                this.compute = new ComputeModel(resp)
            } else if (resp.alias) {
                this.details.alias = resp.alias
                await client.updateWorkspace(this.details, { alias: this.details.alias })
            }
        },
        async restart() {
            this.restarting = true
            try {
                if (this.devfileStatus === 'CHANGED' && !this.needsRestart) {
                    return await client.updateDevfile(this.definitionFilePath)
                }

                // SDK rejects extraneous fields
                await client.updateWorkspace(this.details, {
                    instanceType: this.compute.instanceType,
                    inactivityTimeoutMinutes: this.compute.inactivityTimeoutMinutes,
                })
            } catch {
                this.restarting = false
                client.showLogsMessage('Unable to update the workspace. View the logs for more information')
            }
        },
    },
})
</script>

<style scoped>
html {
    overflow-y: scroll;
}
body {
    padding-right: 12px;
}
#configure-header {
    padding: 16px 0 0 0;
    background-color: var(--vscode-editor-background);
    z-index: 1;
    position: relative;
}
.notification {
    color: var(--vscode-notifications-foreground);
    background-color: var(--vscode-notifications-background);
    display: flex;
    justify-content: flex-end;
    align-items: center;
    margin: 16px 0;
    padding: 12px;
}
#notification-span {
    display: flex;
    justify-content: left;
    align-items: inherit;
    width: 100%;
    flex-grow: 0;
}
#restart-button {
    font-size: small;
    width: 100px;
    flex-grow: 1;
}
#info-notification-icon {
    color: var(--vscode-notificationsInfoIcon-foreground);
}
.slide-down-enter-active {
    transition: all 0.4s ease-in-out;
}
.slide-down-leave-active {
    transition: none;
}
.slide-down-enter-from {
    margin-bottom: -70px;
    transform: translateY(-70px);
}
.slide-down-enter-to {
    margin-bottom: 0px;
}
#restart-notification {
    z-index: 0;
    position: relative;
}
#configure-header {
    padding: 16px 0 0 0;
    background-color: var(--vscode-editor-background);
    z-index: 1;
    position: relative;
}
</style>
