<!-- This Vue File is used Telemetry for CodeWhisperer-->
<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../webviews/client'
import { CodeWhispererUiClick, CodeWhispererWebview } from './backend'

const client = WebviewClientFactory.create<CodeWhispererWebview>()

/**
 * Other Components can extend this to access to these
 * methods from within the HTML without, otherwise they need to
 * define another method which does the same thing.
 */
export default defineComponent({
    name: 'TelemetryClient',
    methods: {
        emitUiClick(id: CodeWhispererUiClick) {
            client.emitUiClick(id)
        },
    },
})
</script>
