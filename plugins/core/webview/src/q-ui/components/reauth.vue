<!-- Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<template>
    <div class="font-amazon bottom-small-gap title centered">{{ title }}</div>
    <div class="font-amazon bottom-small-gap title centered">Please re-authenticate to continue</div>

    <button
        class="login-flow-button continue-button font-amazon"
        v-on:click="handleContinueClick()"
    >
        Re-authenticate
    </button>

    <button
        class="login-flow-button font-amazon logout"
        v-on:click="handleCancel()"
    >
        Sign out
    </button>
</template>


<script lang="ts">
import {defineComponent} from 'vue'
import {Stage} from "../../model";

export default defineComponent({
    name: "reauth",
    props: {
        app: String
    },
    computed: {
        stage(): Stage {
            return this.$store.state.stage
        },
        title(): String {
            if (this.app === 'AMAZONQ') {
                return 'Connection to Amazon Q Expired'
            }

            return 'Connection to AWS Toolkit Expired'
        }
    },
    data() {},
    methods: {
        handleContinueClick() {
            console.log('reauth button clicked')
            window.ideApi.postMessage({ command: 'reauth' })
            this.$emit('stageChanged', 'AUTHENTICATING')
        },
        handleCancel() {
            console.log('signout button clicked')
            window.ideApi.postMessage({ command: 'signout' })
        }
    }
})
</script>

<style scoped lang="scss">
.centered {
    display: flex;
    justify-content: center;
}

.logout {
    color: #3574f0 !important;
    background: none;
}
</style>
