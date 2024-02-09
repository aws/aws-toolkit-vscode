<script lang="ts">
import { defineComponent } from 'vue'

/**
 * Other Components can extend this to access to these
 * methods from within the HTML without, otherwise they need to
 * define another method which does the same thing.
 */
export default defineComponent({
    name: 'TelemetryClient',
    methods: {},
})
</script>
