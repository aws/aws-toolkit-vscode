<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../../webviews/client'
import { AuthUiClick, AuthWebview } from './show'

const client = WebviewClientFactory.create<AuthWebview>()

/**
 * Other Components can extend this to access to these
 * methods from within the HTML without, otherwise they need to
 * define another method which does the same thing.
 */
export default defineComponent({
    name: 'TelemetryClient',
    methods: {
        emitUiClick(id: AuthUiClick) {
            client.emitUiClick(id)
        },
    },
})
</script>
