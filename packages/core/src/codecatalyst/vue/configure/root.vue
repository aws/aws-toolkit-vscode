<template>
    <div id="configure-header">
        <h2 style="display: inline">Settings for {{ devenvName }}</h2>
        <br />
    </div>
    <transition name="slide-down">
        <div id="restart-notification" class="notification" v-if="canRestart">
            <span id="notification-span">
                <span id="info-notification-icon" class="icon icon-lg icon-vscode-info mr-8"></span>
                <span>Restart your Dev Environment to update with changes.</span>
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
        title="Dev Environment Configuration"
        description="All settings except Storage can be changed after creation."
    >
        <compute-panel v-model="compute" type="configure" @edit-settings="editCompute"></compute-panel>
    </settings-panel>
</template>

<script lang="ts">
import summaryPanel, { VueModel as DevEnvDetailsModel } from '../summary.vue'
import computePanel, { VueModel as ComputeModel } from '../compute.vue'
import settingsPanel from '../../../webviews/components/settingsPanel.vue'
import devfilePanel from '../devfile.vue'
import { defineComponent } from 'vue'
import { CodeCatalystConfigureWebview } from './backend'
import { WebviewClientFactory } from '../../../webviews/client'
import saveData from '../../../webviews/mixins/saveData'
import { Status } from '../../../shared/clients/devenvClient'
import { DevEnvironmentSettings } from '../../commands'

const client = WebviewClientFactory.create<CodeCatalystConfigureWebview>()

const model = {
    details: new DevEnvDetailsModel(),
    definitionFilePath: '',
    devenvUrl: '',
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
        devenvName() {
            const alias = this.details.alias
            const branch = this.details.repositories[0]?.branchName

            return alias ?? branch ?? this.details.id
        },
        canRestart() {
            return (this.needsRestart || this.devfileStatus === 'CHANGED') && this.details.status === 'RUNNING'
        },

        // TODO(sijaden): add `busy` and then bind it to all components so they can disable things
    },
    created() {
        client.init().then(env => {
            this.details = env ? new DevEnvDetailsModel(env) : this.details
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
        async editCompute(key: keyof DevEnvironmentSettings) {
            const previous = this.compute[key as Exclude<typeof key, 'alias'>]
            const current = { ...this.compute, alias: this.details.alias }
            const resp = await client.editSetting(current, key)

            if (key !== 'alias') {
                this.needsRestart = this.needsRestart || previous !== resp[key]
                this.compute = new ComputeModel(resp)
            } else if (resp.alias) {
                this.details.alias = resp.alias
                await client.updateDevEnv(this.details, { alias: this.details.alias })
            }
        },
        async restart() {
            this.restarting = true
            try {
                if (this.devfileStatus === 'CHANGED' && !this.needsRestart) {
                    return await client.updateDevfile(this.definitionFilePath)
                }

                // SDK rejects extraneous fields
                const resp = await client.updateDevEnv(this.details, {
                    instanceType: this.compute.instanceType,
                    inactivityTimeoutMinutes: this.compute.inactivityTimeoutMinutes,
                    // persistentStorage: this.compute.persistentStorage,
                })

                this.restarting = !!resp
            } catch {
                this.restarting = false
                client.showLogsMessage('Unable to update the dev Environment. View the logs for more information')
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
    background-color: none;
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
    box-shadow: 2px 2px 8px #111111;
    position: sticky;
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
    top: -70px;
}
.slide-down-enter-to {
    margin-bottom: 0px;
    top: 16px;
}
#restart-notification {
    z-index: 1;
    top: 16px;
}
</style>
