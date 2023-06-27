<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../../webviews/client'
import { AuthUiClick, AuthWebview } from './show'

const client = WebviewClientFactory.create<AuthWebview>()

export default defineComponent({
    name: 'TelemetryClient',
    methods: {
        emitUiClick(id: AuthUiClick) {
            client.emitUiClick(id)
        },
    },
})
</script>
