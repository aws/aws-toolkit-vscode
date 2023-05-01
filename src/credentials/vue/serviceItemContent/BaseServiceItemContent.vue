<template>
    <div class="service-item-content-container border-common">Must Be Implemented</div>
</template>

<script lang="ts">
import { PropType, defineComponent } from 'vue'
import { ServiceItemId } from '../ServiceItem.vue'
import { AuthStatus } from '../authForms/BaseAuthForm.vue'

export default defineComponent({
    name: 'BaseServiceItemContent',
    emits: ['is-auth-connected'],
    props: {
        state: {
            type: Object as PropType<AuthStatus>,
            required: true,
        },
    },
    methods: {
        emitIsAuthConnected(id: ServiceItemId, isConnected: boolean) {
            this.$emit('is-auth-connected', id, isConnected)
        },
    },
})
</script>
<style>
@import './baseServiceItemContent.css';
@import '../shared.css';
</style>
