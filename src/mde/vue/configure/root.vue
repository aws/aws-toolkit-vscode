<template>
    <div id="configure-header">
        <h2 style="display: inline">Environment Settings for {{ details.id }}</h2>
        <a class="ml-16">More info</a>
        <br />
    </div>
    <transition name="slide-down">
        <div id="restart-notification" class="notification" v-if="needsRestart">
            <span id="notification-span">
                <i id="info-notification-icon" class="icon"></i>
                <span>Restart your environment to update with setting changes.</span>
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
        <summary-panel v-model="details" :environment="environment"></summary-panel>
    </settings-panel>
    <settings-panel
        id="dev-file-panel"
        title="DevFile"
        description="Contains the definition to build your application libraries and toolchain. You can change the currently 
        configured definition file."
        v-if="environment === 'remote'"
    >
        <definition-file v-model="definitionFile" :environment="environment"></definition-file>
    </settings-panel>
    <settings-panel
        id="tags-and-labels-panel"
        title="Tags and labels"
        description="Use tags (key and value) to track resources and costs. Use labels (key only) to identify your environment."
    >
        <tags-panel v-model="tags" type="configure" :readonly="readonly"></tags-panel>
    </settings-panel>
    <!-- We currently cannot update environments after creation, leaving this here disabled for now -->
    <settings-panel
        id="compute-settings-panel"
        vscode-id=""
        title="Compute settings"
        description="All settings except EBS Volume can be changed in settings after creation."
        v-show="false"
    >
        <compute-panel v-model="compute" type="configure" @edit-settings="editCompute"></compute-panel>
    </settings-panel>
</template>

<script lang="ts">
import summaryPanel, { VueModel as EnvironmentDetailsModel } from '../summary.vue'
import definitionFile, { VueModel as DevFileModel } from '../definitionFile.vue'
import tagsPanel, { VueModel as TagsModel } from '../tags.vue'
import computePanel, { VueModel as ComputeModel } from '../compute.vue'
import settingsPanel from '../../../webviews/components/settingsPanel.vue'
import { defineComponent, PropType } from 'vue'
import { MdeConfigureWebview } from './backend'
import { WebviewClientFactory } from '../../../webviews/client'
import { SettingsForm } from '../../wizards/environmentSettings'
import saveData from '../../../webviews/mixins/saveData'
import { GetEnvironmentMetadataResponse } from '../../../../types/clientmde'
import { EnvironmentProp } from '../shared'
import { Status } from '../../../shared/clients/mdeEnvironmentClient'

// TODO: every webview should get only a single client
// children components will specify the type of client they need (via its 'protocol')
// this will finalize the decoupling between vue components as now child components
// will not need to know which webview they are in
//
// caveat: there is still an issue that method/function names need to be unique
const client = WebviewClientFactory.create<MdeConfigureWebview>()

type ExtractPropType<T> = T extends PropType<infer U> ? U : never

const SAVE_DEBOUNCE_TIME = 5000 // How long to wait until sending a real update
const model = {
    details: new EnvironmentDetailsModel({}),
    definitionFile: new DevFileModel(),
    devfileStatus: 'STABLE' as Status,
    tags: new TagsModel(),
    compute: new ComputeModel(),
    environment: EnvironmentProp.default as ExtractPropType<typeof EnvironmentProp.type>,
    saveDebounceHandle: undefined as number | undefined,
    restarting: false,
}

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
    computed: {
        readonly() {
            return ['DELETING', 'DELETED', 'FAILED'].includes(this.details.status)
        },
        needsRestart() {
            return this.devfileStatus === 'CHANGED'
        },
    },
    created() {
        client.onEnvironmentUpdate(env => this.updateEnvironment(env))
        client.onDevfileUpdate(event => (this.devfileStatus = event.status ?? 'STABLE'))
        client.init().then(env => {
            this.updateEnvironment(env)
            this.definitionFile.url = env.actions?.devfile?.location ?? ''
        })
    },
    watch: {
        tags() {
            this.saveConfiguration()
        },
    },
    methods: {
        updateEnvironment(env: GetEnvironmentMetadataResponse & { connected: boolean }) {
            this.environment = env.connected ? 'remote' : 'local'
            this.details = env
            // TODO: this will remove anything the user has configured, however, this means
            // the environment has been updated externally. There is now potentially a conflict.
            this.compute = env as any
            const tags = [] as any[]
            Object.keys(env.tags ?? {}).forEach(k => {
                tags.push({ key: k, value: (env.tags ?? {})[k], generated: !!k.match(/^(aws|mde):/) })
            })
            this.tags.tags = tags.sort((a, b) => a.key.localeCompare(b.key))
        },
        editCompute(current: SettingsForm) {
            client.editSettings(current, 'configure').then(settings => {
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
        saveConfiguration() {
            clearTimeout(this.saveDebounceHandle)
            this.saveDebounceHandle = window.setTimeout(() => {
                if (!this.isValid()) {
                    return
                }
                // only thing we can save is 'tags' for now
                const tagMap: Record<string, string> = {}
                this.tags.tags.forEach(({ key, value }) => (tagMap[key] = value))
                client.updateTags(this.details.arn, tagMap)
            }, SAVE_DEBOUNCE_TIME)
        },
        restart(location?: string) {
            // restart flow
            // 1. store MDE env-id as 'restarting' in global memento
            // 2. spawn local toolkit (if possible)
            // 3. send stop request
            // 4. local toolkit sees environment in 'restarting' state, restarts MDE and starts to poll
            // 5. once MDE is started back up, just auto-connect
            this.restarting = true
            if (location) {
                client.startDevfile(location).catch(() => (this.restarting = false))
            } else {
                client.restartEnvironment(this.details).catch(() => (this.restarting = false))
            }
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
/* TODO: make into component? */
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
    background-image: url('/resources/generic/info.svg');
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
