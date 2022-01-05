<template>
    <div>
        <div id="summary-grid">
            <div id="env-id" style="grid-area: env-id">
                <span class="label-context soft">Environment ID</span>
                <b>{{ summary.id }}</b>
            </div>
            <div id="owner-arn" style="grid-area: owner-arn">
                <span class="label-context soft">Owner ARN</span>
                <b>{{ summary.userArn }}</b>
            </div>
            <div id="status" style="grid-area: status" :data-connected="connected">
                <span class="label-context soft">Status</span>
                <b>
                    <i id="connected-icon" class="icon mr-2" v-if="connected"></i>
                    {{ connected ? 'Connected' : status }}
                </b>
            </div>
        </div>
        <button
            id="toggle-state"
            class="button-size button-theme-secondary mt-8"
            type="button"
            :disabled="!stable"
            @click="toggleState"
        >
            <i id="stop-icon" class="icon mr-2" v-if="summary.status === 'RUNNING'"></i>
            <i id="start-icon" class="icon mr-2" v-if="summary.status === 'STOPPED'"></i>
            {{ summary.status === 'RUNNING' ? 'Stop' : 'Start' }}
        </button>
        <button
            id="delete-environment"
            class="button-size button-theme-secondary ml-8 mt-8"
            type="button"
            :disabled="!stable"
            @click="deleteEnvironment"
        >
            Delete Environment
        </button>
        <button
            id="connect-environment"
            class="button-size button-theme-secondary ml-8 mt-8"
            type="button"
            :disabled="!stable"
            v-if="!connected"
            @click="connect"
        >
            Connect
        </button>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import {
    DeleteEnvironmentResponse,
    GetEnvironmentMetadataResponse,
    StartEnvironmentResponse,
    StopEnvironmentResponse,
} from '../../../types/clientmde'
import { WebviewClientFactory } from '../../webviews/client'
import saveData from '../../webviews/mixins/saveData'
import { createClass, createType } from '../../webviews/util'
import { EnvironmentProp } from './shared'

declare class Protocol {
    connect(): Promise<void>
    toggleMdeState: (
        mde: GetEnvironmentMetadataResponse
    ) => Promise<StartEnvironmentResponse | StopEnvironmentResponse | undefined>
    deleteEnvironment: (mde: GetEnvironmentMetadataResponse) => Promise<DeleteEnvironmentResponse | undefined>
}

const client = WebviewClientFactory.create<Protocol>()

export const VueModel = createClass<GetEnvironmentMetadataResponse>({ status: '' }, true)

export default defineComponent({
    name: 'environment-summary',
    props: {
        modelValue: {
            type: createType(VueModel),
            required: true,
        },
        /*
        client: {
            type: createType(Protocol),
            required: true,
        },
        */
        environment: EnvironmentProp,
    },
    computed: {
        status() {
            return this.summary.status.charAt(0).concat(this.summary.status.slice(1).toLowerCase())
        },
        connected() {
            return this.environment === 'remote'
        },
        stable() {
            return this.summary.status === 'RUNNING' || this.summary.status === 'STOPPED'
        },
        summary() {
            return this.modelValue
        },
    },
    mixins: [saveData],
    methods: {
        update(key: keyof InstanceType<typeof VueModel>, value: any) {
            this.$emit('update:modelValue', { ...this.modelValue, [key]: value })
        },
        toggleState() {
            client.toggleMdeState(this.summary).then(resp => {
                this.summary.status = resp?.status ?? this.summary.status
            })
            this.summary.status = 'PENDING'
        },
        deleteEnvironment() {
            client.deleteEnvironment(this.summary).then(resp => {
                resp && this.update('status', resp.status)
            })
        },
        connect() {
            client.connect()
        },
    },
})
</script>

<style scoped>
#summary-grid {
    display: grid;
    justify-content: left;
    grid-template-areas:
        'env-id owner-arn'
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
body.vscode-dark #start-icon {
    background-image: url('/resources/dark/play-circle.svg');
}
body.vscode-light #start-icon {
    background-image: url('/resources/light/play-circle.svg');
}
body.vscode-dark #stop-icon {
    background-image: url('/resources/dark/stop-circle.svg');
}
body.vscode-light #stop-icon {
    background-image: url('/resources/light/stop-circle.svg');
}
</style>
