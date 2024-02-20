<script lang="ts">
import { PropType, defineComponent } from 'vue'

export interface BaseNotificationProps {
    args: { [key: string]: any }
    id: string
}

export default defineComponent({
    name: 'BaseNotification',
    props: {
        args: {
            type: Object as PropType<{ [key: string]: any }>,
            required: false,
        },
    },
    methods: {
        getComponentId() {
            console.error(`Auth: Component ${this.$options.name} did not implement 'getComponentId()'`)
        },
    },
})
</script>
