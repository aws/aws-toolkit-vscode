<!-- 
    This is a re-usable component for creating a dynamic title
    that changes depending on if the auth method is already connected.
 -->

<template>
    <div style="display: flex; gap: 1em; justify-content: center">
        <label class="auth-container-title"
            ><div class="pass-icon icon icon-vscode-pass-filled"></div>
            Connected to <slot></slot
        ></label>
    </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({})
</script>

<style>
.pass-icon {
    color: #73c991;
}
</style>
