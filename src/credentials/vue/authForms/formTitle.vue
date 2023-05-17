<!-- 
    This is a re-usable component for creating a dynamic title
    that changes depending on if the auth method is already connected.
 -->

<template>
    <div v-if="isConnected" style="display: flex">
        <div class="pass-icon icon icon-lg icon-vscode-pass-filled"></div>
        <label class="auth-form-title">Connected to <slot></slot></label>
    </div>
    <div v-else>
        <label class="auth-form-title"><slot></slot></label>
    </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
    props: {
        isConnected: {
            type: Boolean,
            required: true,
        },
    },
})
</script>

<style>
.pass-icon {
    color: #73c991;
    margin-right: 5px;
}
</style>
