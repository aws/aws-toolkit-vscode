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
        <RegionProfileSelector
            v-if="authFlowState === 'PENDING_PROFILE_SELECTION'"
            :app="app"
            :state="authFlowState"
        ></RegionProfileSelector>
    </div>
</template>
<script lang="ts">
import { PropType, defineComponent } from 'vue'
import Login, { getReadyElementId as getLoginReadyElementId } from './login.vue'
import Reauthenticate, { getReadyElementId as getReauthReadyElementId } from './reauthenticate.vue'
import RegionProfileSelector, { getReadyElementId as getSelectProfileReadyElementId } from './regionProfileSelector.vue'
import { AuthFlowState, FeatureId } from './types'
import { WebviewClientFactory } from '../../../webviews/client'
import { CommonAuthWebview } from './backend'

const client = WebviewClientFactory.create<CommonAuthWebview>()

export default defineComponent({
    name: 'auth',
    components: {
        Login,
        Reauthenticate,
        RegionProfileSelector,
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
    async updated() {
        if (didLoad) {
            handleLoaded()
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
            } else if (this.authFlowState === 'PENDING_PROFILE_SELECTION') {
                ;(window as any).uiState = 'selectProfile'
                ;(window as any).uiReadyElementId = getSelectProfileReadyElementId()
            } else if (this.authFlowState && this.authFlowState !== undefined) {
                ;(window as any).uiState = 'reauth'
                ;(window as any).uiReadyElementId = getReauthReadyElementId()
            }

            this.refreshKey += 1
        },
    },
})

// ---- START ---- The following handles the process of indicating the UI has loaded successfully.
// TODO: Move this in to a reusable class for other webviews, it feels a bit messy here
const didPageSetReady: { auth: boolean; selectProfile: boolean } = { auth: false, selectProfile: false }

// Setup error handlers to report. This may not actually be able to catch certain errors that we'd expect,
// so this may have to be revisited.
window.onerror = function (message) {
    const uiState = (window as any).uiState
    const page: 'auth' | 'selectProfile' = uiState === 'login' || uiState === 'reauth' ? 'auth' : 'selectProfile'
    if (didPageSetReady[page]) {
        return
    }

    setUiReady((window as any).uiState, message.toString())
}
document.addEventListener(
    'error',
    (e) => {
        const uiState = (window as any).uiState
        const page: 'auth' | 'selectProfile' = uiState === 'login' || uiState === 'reauth' ? 'auth' : 'selectProfile'
        if (didPageSetReady[page]) {
            return
        }

        setUiReady((window as any).uiState, e.message)
    },
    true
)

let didLoad = false
window.addEventListener('load', () => {
    didLoad = true
})
const handleLoaded = () => {
    // in case some unexpected behavior triggers this flow again, skip since we already emitted for this instance
    const uiState = (window as any).uiState
    const page: 'auth' | 'selectProfile' = uiState === 'login' || uiState === 'reauth' ? 'auth' : 'selectProfile'
    if (didPageSetReady[page]) {
        return
    }

    const foundElement = !!document.getElementById((window as any).uiReadyElementId)
    if (!foundElement) {
        setUiReady((window as any).uiState, `Could not find element: ${(window as any).uiReadyElementId}`)
    } else {
        // Successful load!
        setUiReady((window as any).uiState)
    }
}
const setUiReady = (state: 'login' | 'reauth' | 'selectProfile', errorMessage?: string) => {
    client.setUiReady(state, errorMessage)

    const page = state === 'selectProfile' ? 'selectProfile' : 'auth'
    didPageSetReady[page] = true
}
// ---- END ----
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
