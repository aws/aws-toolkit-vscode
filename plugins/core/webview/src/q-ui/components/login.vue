<!-- Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<!-- This Vue File is the login webview of AWS Toolkit and Amazon Q.-->
<template>
    <div v-bind:class="[disabled ? 'disabled-form' : '']" class="auth-container centered-with-max-width">
        <button v-if="(stage !== 'START' || cancellable) && stage !== 'AUTHENTICATING'" class="back-button" @click="handleBackButtonClick" tabindex="-1">
            <svg width="24" height="24" viewBox="0 -3 13 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                    d="M4.98667 0.0933332L5.73333 0.786666L1.57333 4.94667H12.0267V5.96H1.57333L5.73333 10.0667L4.98667 10.8133L0.0266666 5.8V5.10667L4.98667 0.0933332Z"
                    fill="#21A2FF"
                />
            </svg>
        </button>

        <LoginOptions :app="app" v-if="stage === 'START'" @backToMenu="handleBackButtonClick" @stageChanged="mutateStage" @login="login"/>
        <SsoLoginForm :app="app" v-if="stage === 'SSO_FORM'" @backToMenu="handleBackButtonClick" @stageChanged="mutateStage" @login="login"/>
        <AwsProfileForm v-if="stage === 'AWS_PROFILE'" @backToMenu="handleBackButtonClick" @stageChanged="mutateStage" @login="login"/>
        <Authenticating v-if="stage === 'AUTHENTICATING'" :selected-login-option="this.selectedLoginOption" @cancel="handleCancelButton"/>

        <template v-if="stage === 'CONNECTED'"></template>
    </div>
</template>
<script lang="ts">
import {defineComponent} from 'vue'
import SsoLoginForm from "./ssoLoginForm.vue";
import LoginOptions from "./loginOptions.vue";
import AwsProfileForm from "./awsProfileForm.vue";
import Authenticating from "./authenticating.vue";
import {BuilderId, ExistConnection, Feature, IdC, LoginOption, LongLivedIAM, Stage} from "../../model";

export default defineComponent({
    name: 'Login',
    components: {
        SsoLoginForm,
        LoginOptions,
        AwsProfileForm,
        Authenticating
    },
    props: {
        disabled: {
            type: Boolean,
            default: false,
        },
        app: {
            type: String,
            default: '',
            required: true,
        }
    },
    data() {
        return {
            existingLogin: {id: -1, text: '', title: ''},
            selectedLoginOption: undefined as (LoginOption | undefined),
            app: this.app,
        }
    },
    computed: {
        stage(): Stage {
            return this.$store.state.stage
        },
        feature(): Feature {
            return this.$store.state.feature
        },
        cancellable(): boolean {
            return this.$store.state.cancellable
        },
    },
    methods: {
        mutateStage(stage: Stage) {
            this.$store.commit('setStage', stage)
        },
        handleBackButtonClick() {
            if (this.cancellable) {
                window.ideApi.postMessage({command: 'toggleBrowser'})
            }
            this.mutateStage('START')
        },
        handleCancelButton() {
            window.ideClient.cancelLogin()
            this.mutateStage('START')
        },
        login(type: LoginOption) {
            this.selectedLoginOption = type
            this.mutateStage('AUTHENTICATING')
            if (type instanceof IdC) {
                window.ideApi.postMessage({
                    command: 'loginIdC',
                    url: type.url,
                    region: type.region,
                    feature: this.feature
                })
            } else if (type instanceof BuilderId) {
                window.ideApi.postMessage({command: 'loginBuilderId'})
            } else if (type instanceof LongLivedIAM) {
                window.ideApi.postMessage({
                    command: 'loginIAM',
                    profileName: type.profileName,
                    accessKey: type.accessKey,
                    secretKey: type.secret
                })
            } else if (type instanceof ExistConnection) {
                window.ideApi.postMessage({ command: 'selectConnection', connectionId:  type.pluginConnectionId})
            }
        },
    },
    mounted() {},
    beforeUpdate() {}
})
</script>

<style>
</style>
