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
import Login from './login.vue'
import Reauthenticate from './reauthenticate.vue'
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
    },
    methods: {
        async refreshAuthState() {
            await client.refreshAuthState()
            this.authFlowState = await client.getAuthState()
            this.refreshKey += 1
        },
    },
})
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
