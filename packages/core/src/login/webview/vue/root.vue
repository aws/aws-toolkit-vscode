<!-- This Vue File is a template for AWS Toolkit Login, configure app to TOOLKIT if for toolkit login
configure app to AMAZONQ if for Amazon Q login
-->
<template>
    <!-- Body -->
    <div class="body" style="height: 100vh" :data-app="app">
        <!-- Functionality -->
        <Login v-if="authFlowState === 'LOGIN'" :app="app"></Login>
        <Reauthenticate
            v-else-if="authFlowState === 'REAUTHNEEDED' || authFlowState === 'REAUTHENTICATING'"
            :app="app"
            :state="authFlowState"
            :key="refreshKey"
        ></Reauthenticate>
    </div>
</template>
<script lang="ts">
import { PropType, defineComponent } from 'vue'
import Login, { getReadyElementId as getLoginReadyElementId } from './login.vue'
import Reauthenticate, { getReadyElementId as getReauthReadyElementId } from './reauthenticate.vue'
import { AuthFlowState, FeatureId } from './types'
import { WebviewClientFactory } from '../../../webviews/client'
import { CommonAuthWebview } from './backend'

const client = WebviewClientFactory.create<CommonAuthWebview>()

export default defineComponent({
    name: 'auth',
    components: {
        Login,
        Reauthenticate,
    },
    data() {
        return {
            // Where the user is in the Auth process, this impacts what they see
            authFlowState: '' as AuthFlowState,
            // When the value changes the component is forced to rebuild
            refreshKey: 0,
        }
    },
    props: {
        app: {
            type: String as PropType<FeatureId>,
            required: true,
        },
    },
    async created() {
        // Any backend auth changes will trigger the webview to refresh
        client.onActiveConnectionModified(() => {
            this.refreshAuthState()
        })

        await this.refreshAuthState()

        // We were recieving the 'load' event before refreshAuthState() resolved (I'm assuming behavior w/ Vue + browser loading not blocking),
        // so post refreshAuhState() if we detect we already loaded, then execute immediately since the event already happened.
        if (didLoad) {
            handleLoaded()
        } else {
            window.addEventListener('load', () => {
                handleLoaded()
            })
        }
    },
    methods: {
        async refreshAuthState() {
            await client.refreshAuthState()
            this.authFlowState = await client.getAuthState()

            // Used for telemetry purposes
            if (this.authFlowState === 'LOGIN') {
                ;(window as any).uiState = 'login'
                ;(window as any).uiReadyElementId = getLoginReadyElementId()
            } else if (this.authFlowState && this.authFlowState !== undefined) {
                ;(window as any).uiState = 'reauth'
                ;(window as any).uiReadyElementId = getReauthReadyElementId()
            }

            this.refreshKey += 1
        },
    },
})

// THe following handles the process of indicating the UI has loaded successfully.
let emittedReady = false
let errorMessage: string | undefined = undefined
// Catch JS errors
window.onerror = function (message) {
    errorMessage = message.toString()
}
// Listen for DOM errors
document.addEventListener(
    'error',
    function (e) {
        errorMessage = e.message
    },
    true
)
let didLoad = false
window.addEventListener('load', () => {
    didLoad = true
})
const handleLoaded = () => {
    // TODO: See if this ever gets triggered, and if not, delete emittedReady
    if (emittedReady) {
        console.log(`NIKOLAS: load event triggered a subsequent time`)
    }

    if (!emittedReady && errorMessage === undefined && !!document.getElementById((window as any).uiReadyElementId)) {
        emittedReady = true // ensure we only emit once per load
        client.setUiReady((window as any).uiState)
        window.postMessage({ command: `ui-is-ready`, state: (window as any).uiState })
    }
}
</script>
<style>
body {
    /**
     * Overriding the margin and padding defined by vscode
     * https://github.com/microsoft/vscode/blame/54e0cddffb51553e76fb8d65474ba855c30621e8/src/vs/workbench/contrib/webview/browser/pre/index.html
     */
    padding: 0;
}

.body {
    /* The container takes up the entire height of the screen */
    height: 100vh;
    display: flex;
    flex-direction: column;
    /* All items are centered horizontally */
    align-items: center;
}
</style>
