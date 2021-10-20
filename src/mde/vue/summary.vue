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
                    <i id="connected-icon" class="icon" v-if="connected && summary.status === 'RUNNING'"></i>
                    {{ connected ? 'Connected' : summary.status }}
                </b>
            </div>
        </div>
        <button
            id="toggle-state"
            class="button-size button-theme-secondary mt-8"
            type="button"
            :disabled="summary.status !== 'RUNNING' && summary.status !== 'STOPPED'"
            @click="toggleState"
        >
            {{ summary.status === 'RUNNING' ? 'Stop' : 'Start' }}
        </button>
    </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { GetEnvironmentMetadataResponse } from '../../../types/clientmde'
import { WebviewClientFactory } from '../../webviews/client'
import saveData from '../../webviews/mixins/saveData'
import { createClass } from '../../webviews/util'
import { SettingsForm } from '../wizards/environmentSettings'
import { Commands } from './configure/backend'

const client = WebviewClientFactory.create<Commands>()

export const VueModel = createClass<GetEnvironmentMetadataResponse>({}, true)

export default defineComponent({
    name: 'environment-summary',
    props: {
        modelValue: {
            type: VueModel,
            required: true,
        },
        environment: {
            type: String as PropType<'local' | 'remote'>,
            default: 'local',
        },
    },
    computed: {
        connected() {
            return this.environment === 'remote'
        },
        summary() {
            return this.modelValue
        },
    },
    mixins: [saveData],
    methods: {
        toggleState() {
            client.toggleMdeState(this.summary).then(resp => {
                this.summary.status = resp?.status ?? this.summary.status
            })
            this.summary.status = 'PENDING'
        },
    },
    emits: {
        editSettings: (current: SettingsForm) => current !== undefined,
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
#status[data-connected='true'] {
    color: #00aa00;
}
#connected-icon {
    background-image: url('/resources/light/expand-less.svg');
}
</style>
