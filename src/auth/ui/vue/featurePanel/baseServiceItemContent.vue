<template>
    <div class="feature-panel-container border-common">Must Be Implemented</div>
</template>

<script lang="ts">
import { PropType, defineComponent, reactive } from 'vue'
import { FeatureStatus } from '../authForms/shared.vue'
import { ServiceItemId } from '../types'
import TelemetryClient from '../telemetry.vue'
import { WebviewClientFactory } from '../../../../webviews/client'
import { AuthWebview } from '../show'

const client = WebviewClientFactory.create<AuthWebview>()

export default defineComponent({
    name: 'BaseServiceItemContent',
    extends: TelemetryClient,
    props: {
        state: {
            type: Object as PropType<FeatureStatus>,
            required: true,
        },
        isActive: {
            type: Boolean,
            required: true,
        },
    },
    data() {
        return {
            authFormContainerKey: 0,
        }
    },
    methods: {
        /** Refreshes the element that has the ":key=authFormContainerKey" attribute set */
        refreshAuthFormContainer() {
            this.authFormContainerKey++
        },
    },
})

/**
 * Manages the state of the actively edited panel for
 * border highlighting purposes
 */
export class PanelActivityState {
    static #instance: PanelActivityState
    static get instance() {
        return (this.#instance ??= new PanelActivityState())
    }
    private constructor() {}

    isActive = reactive({
        awsExplorer: false,
        codecatalyst: false,
        codewhisperer: false,
    } as { [id in ServiceItemId]: boolean })

    /** Register a panel to notify of user activity when clicked */
    registerPanel(panelCssId: string, panel: ServiceItemId) {
        const panelElement = document.getElementById(panelCssId)
        panelElement?.addEventListener('click', () => {
            this.setActivePanel(panel)
        })
    }

    /**
     * When we first open a webview we want a certain panel to
     * be highlighted to guide the user. This sets that stuff up.
     */
    async setupInitialActivePanel() {
        const panel = await client.getInitialService()
        if (!panel) {
            return
        }
        this.setActivePanel(panel)

        /**
         * For when the webview is ALREADY OPENED and the user
         * causes it to open from somewhere else (eg ellipsis menu for CW)
         */
        client.onDidSelectService(panel => {
            this.setActivePanel(panel)
        })
    }

    private setActivePanel(panel: ServiceItemId) {
        Object.keys(this.isActive).forEach(k => (this.isActive[k as ServiceItemId] = false))
        this.isActive[panel] = true
    }
}
</script>
<style>
@import './baseServiceItemContent.css';
@import '../shared.css';
</style>
