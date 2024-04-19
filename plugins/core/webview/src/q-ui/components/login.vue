<!-- Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<!-- This Vue File is the login webview of AWS Toolkit and Amazon Q.-->
<template>
    <div v-bind:class="[disabled ? 'disabled-form' : '']" class="auth-container">
        <Logo
            :app="app"
            :is-connected="stage === 'CONNECTED'"
        />

        <Reauth v-if="stage === 'REAUTH'" :app="app" @stageChanged="mutateStage"/>
        <LoginOptions :app="app" v-if="stage === 'START'" @backToMenu="handleBackButtonClick" @stageChanged="mutateStage"/>
        <SsoLoginForm :app="app" v-if="stage === 'SSO_FORM'" @backToMenu="handleBackButtonClick" @stageChanged="mutateStage"/>
        <AwsProfileForm v-if="stage === 'AWS_PROFILE'" @backToMenu="handleBackButtonClick" @stageChanged="mutateStage"/>

        <template v-if="stage === 'AUTHENTICATING'">
            <div class="font-amazon">
                <div class="title bottom-small-gap">{{ this.authenticatingText }}</div>
                <div v-if="requireConfirmationCodeOrNot" class="confirmation-code-container bottom-small-gap">
                    <div class="hint">CONFIRMATION CODE</div>
                    <div class="confirmation-code">{{ this.authorizationCode }}</div>
                </div>
                <button
                    class="login-flow-button cancel-button font-amazon"
                    v-on:click="handleCancelButton()">
                    Cancel
                </button>
            </div>
        </template>

        <template v-if="stage === 'CONNECTED'"></template>
    </div>
</template>
<script lang="ts">
import {defineComponent} from 'vue'
import Logo from './logo.vue'
import SsoLoginForm from "./ssoLoginForm.vue";
import LoginOptions from "./loginOptions.vue";
import AwsProfileForm from "./awsProfileForm.vue";
import Reauth from "./reauth.vue";
import {LoginIdentifier, LoginOption, Stage} from "../../model";

export default defineComponent({
    name: 'Login',
    components: {
        Logo,
        SsoLoginForm,
        LoginOptions,
        AwsProfileForm,
        Reauth
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
            existingLogin: { id: -1, text: '', title: '' },
            selectedLoginOption: undefined as (LoginOption | undefined),
            app: this.app,
            profileName: '',
        }
    },
    computed: {
        stage(): Stage {
            return this.$store.state.stage
        },
        cancellable(): boolean {
            return this.$store.state.cancellable
        },
        authorizationCode: {
            get() {
                return this.$store.state.authorizationCode
            },
            set(value: string | undefined) {
                this.$store.commit('setAuthorizationCode', value)
            }
        },
        isAuthorizationInProgress(): boolean {
            return this.authorizationCode !== undefined
        },
        authenticatingText(): string {
            if (this.selectedLoginOption?.id === LoginIdentifier.IAM_CREDENTIAL) {
                return 'Connecting to IAM...'
            } else if (this.selectedLoginOption?.id === LoginIdentifier.BUILDER_ID || this.selectedLoginOption?.id === LoginIdentifier.ENTERPRISE_SSO) {
                return 'Authenticating in browser...'
            }

            return ''
        },
        requireConfirmationCodeOrNot(): boolean {
            return this.selectedLoginOption?.requiresBrowser() === true && this.authorizationCode?.length !== 0
        }
    },
    methods: {
        mutateStage(stage: Stage, loginOption: LoginOption | undefined) {
            console.log('mutating stage=', stage)
            console.log('mutating loginOption=', loginOption)
            this.selectedLoginOption = loginOption
            this.$store.commit('setStage', stage)
        },
        handleBackButtonClick() {
            if (this.cancellable && this.stage === 'START') {
                window.ideApi.postMessage({ command: 'toggleBrowser' })
            }
            this.mutateStage('START', undefined)
        },
        handleCancelButton() {
            window.ideClient.cancelLogin()
            this.mutateStage('START', undefined)
            this.authorizationCode = undefined
        },
        changeTheme(darkMode: boolean) {
            const oldCssId = darkMode ? "jb-light" : "jb-dark"
            const newCssId = darkMode ? "jb-dark" : "jb-light"
            document.body.classList.add(newCssId);
            document.body.classList.remove(oldCssId);
        },
    },
    mounted() {
        console.log('login mounted')
        window.changeTheme = this.changeTheme.bind(this)
        window.ideApi.postMessage({command: 'prepareUi'})
    },
    beforeUpdate() {
        console.log('login beforeUpdate')
    }
})
</script>

<style>
.confirmation-code-container {
    margin-top: 20px;
    border: 1px
}

.hint {
    color: #909090;
    margin-bottom: 5px;
    margin-top: 5px;
}

.confirmation-code {
    font-size: 48px;
    font-weight: bold;
}

.auth-container {
    margin-left: 20px;
    margin-right: 20px;
}
</style>
