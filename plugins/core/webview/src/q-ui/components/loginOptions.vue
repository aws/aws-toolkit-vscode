<!-- Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<template>
    <QOptions v-if="app === 'AMAZONQ'" @stageChanged="stageChanged" @login="login"/>
    <ToolkitOptions v-if="app === 'TOOLKIT'" @stageChanged="stageChanged" @login="login"/>
</template>

<script lang="ts">
import {defineComponent} from 'vue'
import QOptions from "./qOptions.vue";
import ToolkitOptions from "./toolkitOptions.vue"
import {Stage, LoginIdentifier, BuilderId, LoginOption} from "../../model";

export default defineComponent({
    name: "loginOptions",
    components: {
        QOptions,
        ToolkitOptions
    },
    props: {
        app: String
    },
    computed: {},
    data() {
        return {
            app: this.app,
            existingLogin: { id: -1, text: '', title: '' },
            selectedLoginOption: LoginIdentifier.NONE,
            LoginOption: LoginIdentifier
        }
    },
    methods: {
        toggleItemSelection(itemId: number) {
            this.selectedLoginOption = itemId
        },
        stageChanged(stage: Stage) {
            this.$emit('stageChanged', stage)
        },
        login(type: LoginOption) {
            this.$emit('login', type)
        },
        async handleContinueClick() {
            if (this.selectedLoginOption === LoginIdentifier.BUILDER_ID) {
                this.$emit('stageChanged', 'AUTHENTICATING', new BuilderId())
                window.ideApi.postMessage({ command: 'loginBuilderId' })
            } else if (this.selectedLoginOption === LoginIdentifier.ENTERPRISE_SSO) {
                this.$emit('stageChanged', 'SSO_FORM')
            } else if (this.selectedLoginOption === LoginIdentifier.EXISTING_LOGINS) {
                this.$emit('stageChanged', 'START')
            } else if (this.selectedLoginOption === LoginIdentifier.IAM_CREDENTIAL) {
                this.$emit('stageChanged', 'AWS_PROFILE')
            }
        },
    }
})
</script>
