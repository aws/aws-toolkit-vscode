<template>
    <h2>Create Environment</h2>
    Just some filler text
    <settings-panel
        id="role-panel"
        title="IAM Role"
        description="This environment requires an associated IAM role. If you do not have one, we will create a default role."
    >
        <role-panel v-model="panel"></role-panel>
    </settings-panel>
    <div class="flex-right">
        <button id="cancel-submit" class="ml-8 mr-8 button-theme-secondary" type="button" @click="cancel">
            Cancel
        </button>
        <button id="submit-create" class="button-theme-primary" type="button" @click="submit">
            Create environment
        </button>
    </div>
    <p>More configurations</p>
    <settings-panel
        id="dev-file-panel"
        title="DevFile"
        description="Contains the definition to build your application libraries and toolchain. Can be updated later in your IDE."
        collapseable
    >
        <definition-file v-model="panel"></definition-file>
    </settings-panel>
    <settings-panel
        id="tags-and-labels-panel"
        title="Tags and labels - optional"
        description="Use tags (key and value) to track resources and costs. Use lables (key only) to identify your environment."
        collapseable
    >
        <tags-panel v-model="panel"></tags-panel>
    </settings-panel>
    <settings-panel
        id="compute-settings-panel"
        title="Compute settings"
        description="All settings except EBS Volume can be modified in settings after creation."
        collapseable
    >
        <compute-panel
            v-model="panel.computeSettings"
            @edit-settings="postMessage({ command: 'editSettings', data: $event })"
        ></compute-panel>
    </settings-panel>
</template>

<script lang="ts">
import definitionFile from './definitionFile.vue'
import rolePanel from './roles.vue'
import tagsPanel from './tags.vue'
import settingsPanel from '../../webviews/components/settingsPanel.vue'
import computePanel from './compute.vue'
import { WebviewApi } from 'vscode-webview'
import { defineComponent } from 'vue'
import { TagWithErrors } from './tags.vue'
import { IAM } from 'aws-sdk'
import { BackendCommand } from './backend'
import { SettingsForm } from '../wizards/environmentSettings'
import { DEFAULT_COMPUTE_SETTINGS } from '../constants'

declare const vscode: WebviewApi<{ panel: typeof model }>

let model = {
    mode: 'template' as 'template' | 'repository',
    roleMode: 'new-role' as 'new-role' | 'select-role',
    templates: [{ name: 'test', source: '' as any }],
    definitionFile: '',
    repositoryUrl: '',
    tags: [] as TagWithErrors[],
    roles: [] as IAM.Role[],
    selectedRoleName: '',
    computeSettings: DEFAULT_COMPUTE_SETTINGS,
}

interface Initialized {
    command: 'initialized'
    data?: never
}
interface SubmitForm {
    command: 'submit'
    data: typeof model
}
interface CancelForm {
    command: 'cancel'
    data?: never
}
interface EditSettings {
    command: 'editSettings'
    data?: SettingsForm
}

export type FrontendCommand = Initialized | SubmitForm | CancelForm | EditSettings

export default defineComponent({
    components: {
        definitionFile,
        tagsPanel,
        settingsPanel,
        computePanel,
        rolePanel,
    },
    beforeCreate() {
        const lastState: { panel?: typeof model } | undefined = vscode.getState()

        if (lastState?.panel !== undefined) {
            model = lastState.panel
        }
    },
    created() {
        window.addEventListener('message', (event: MessageEvent<BackendCommand>) => {
            const message = event.data

            switch (message.command) {
                case 'loadRoles':
                    this.panel.roles = message.data
                    break
                case 'loadTemplates':
                    message.data.forEach(t => this.panel.templates.push(t))
                    break
                case 'loadEnvironmentSettings':
                    this.panel.computeSettings = message.data
                    this.saveState()
                    break
            }
        })

        this.postMessage({ command: 'initialized' })
    },
    methods: {
        submit() {
            if (!this.isValid()) {
                return
            }
            this.postMessage({ command: 'submit', data: this.panel })
        },
        cancel() {
            this.postMessage({ command: 'cancel' })
        },
        postMessage(message: FrontendCommand) {
            vscode.postMessage({
                command: message.command,
                data: JSON.parse(JSON.stringify(message?.data ?? {})),
            })
        },
        saveState() {
            // no way to listen for when the iframe is being removed from the DOM so we must instead update constantly
            const serialized = JSON.parse(JSON.stringify(this.panel))
            vscode.setState(Object.assign(vscode.getState() ?? {}, { panel: serialized }))
        },
        isValid() {
            // TODO: just have components emit an 'error' event to notifiy containers that they should not submit
            // we should also just provide the offending element id so we can link to it
            return this.panel.tags.map(({ keyError, valueError }) => keyError || valueError).reduce((a, b) => a || b)
        },
    },
    watch: {
        panel() {
            this.saveState()
        },
    },
    data: () => ({ panel: model }),
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
