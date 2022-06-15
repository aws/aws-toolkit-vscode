<template>
    <div>
        <div id="summary-grid">
            <div id="branch" style="grid-area: branch">
                <span class="label-context soft">Branch</span>
                <b>{{ branchName }}</b>
                <!--TODO: add link here-->
            </div>
            <div id="project" style="grid-area: project">
                <span class="label-context soft">Project</span>
                <b>{{ summary.project.name }}</b>
            </div>
            <div id="status" style="grid-area: status" :data-connected="isConnected">
                <span class="label-context soft">Status</span>
                <b>
                    <i id="connected-icon" class="icon mr-2" v-if="isConnected"></i>
                    {{ isConnected ? 'Connected' : status }}
                </b>
            </div>
        </div>
        <button
            id="toggle-state"
            class="button-theme-secondary mt-8"
            type="button"
            :disabled="!isConnected"
            @click="stopWorkspace"
        >
            <i id="stop-icon" class="icon mr-2"></i>
            {{ 'Stop' }}
        </button>
        <!--TODO: add generic 'delete thing' prompt then enable this-->
        <button
            id="delete-environment"
            class="button-theme-secondary ml-8 mt-8"
            type="button"
            :disabled="!isConnected"
            @click="deleteWorkspace"
            v-show="false"
        >
            Delete Workspace
        </button>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../webviews/client'
import saveData from '../../webviews/mixins/saveData'
import { createClass, createType } from '../../webviews/util'
import { CawsConfigureWebview } from './configure/backend'
import { CawsDevEnv } from '../../shared/clients/cawsClient'

const client = WebviewClientFactory.create<CawsConfigureWebview>()

type PartialModel = Pick<CawsDevEnv, 'alias' | 'org' | 'project' | 'repositories' | 'status' | 'developmentWorkspaceId'>
export const VueModel = createClass<PartialModel>({
    org: { name: '' },
    project: { name: '' },
    repositories: [],
    status: '',
    developmentWorkspaceId: '',
})

export default defineComponent({
    name: 'workspace-summary',
    mixins: [saveData],
    props: {
        modelValue: {
            type: createType(VueModel),
            required: true,
        },
    },
    computed: {
        status() {
            return this.summary.status.charAt(0).concat(this.summary.status.slice(1).toLowerCase())
        },
        isConnected() {
            return this.summary.status === 'RUNNING'
        },
        summary() {
            return this.modelValue
        },
        branchName() {
            return this.summary.repositories[0]?.branchName
        },
    },
    methods: {
        update(key: keyof InstanceType<typeof VueModel>, value: any) {
            this.$emit('update:modelValue', { ...this.modelValue, [key]: value })
        },
        // Need to move these two remote calls up into the root component.
        async stopWorkspace() {
            try {
                this.update('status', 'STOPPING')
                await client.stopWorkspace(this.summary)
            } catch {
                this.update('status', 'RUNNING')
            }
        },
        async deleteWorkspace() {
            try {
                this.update('status', 'DELETING')
                await client.deleteWorkspace(this.summary)
            } catch {
                this.update('status', 'RUNNING')
            }
        },
    },
})
</script>

<style scoped>
#summary-grid {
    display: grid;
    justify-content: left;
    grid-template-areas:
        'branch project'
        'status .';
    gap: 16px 24px;
}
#edit-compute-settings {
    margin-top: 16px;
}
body.vscode-dark #status[data-connected='true'] {
    color: #73c991;
}
/* TODO: darker green for light-theme */
body.vscode-light #status[data-connected='true'] {
    color: #73c991;
}
#connected-icon {
    /* TODO: use an in-line svg loader */
    background-image: url('/resources/generic/pass.svg');
}
body.vscode-dark #stop-icon {
    background-image: url('/resources/dark/stop-circle.svg');
}
body.vscode-light #stop-icon {
    background-image: url('/resources/light/stop-circle.svg');
}
</style>
