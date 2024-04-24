<!-- Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<!-- This Vue File is the login webview of AWS Toolkit and Amazon Q.-->
<template>
    <div v-bind:class="[disabled ? 'disabled-form' : '']" class="auth-container">
        <Logo
            :app="app"
            :is-connected="stage === 'CONNECTED'"
        />

        <button v-if="cancellable" class="back-button" @click="handleBackButtonClick" tabindex="-1">
            <svg width="24" height="24" viewBox="0 -3 13 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                    d="M4.98667 0.0933332L5.73333 0.786666L1.57333 4.94667H12.0267V5.96H1.57333L5.73333 10.0667L4.98667 10.8133L0.0266666 5.8V5.10667L4.98667 0.0933332Z"
                    fill="#21A2FF"
                />
            </svg>
        </button>

        <Reauth v-if="stage === 'REAUTH'" :app="app" @stageChanged="mutateStage"/>
        <LoginOptions :app="app" v-if="stage === 'START'" @backToMenu="handleBackButtonClick" @stageChanged="mutateStage" @login="login"/>
        <SsoLoginForm :app="app" v-if="stage === 'SSO_FORM'" @backToMenu="handleBackButtonClick" @stageChanged="mutateStage" @login="login"/>
        <AwsProfileForm v-if="stage === 'AWS_PROFILE'" @backToMenu="handleBackButtonClick" @stageChanged="mutateStage" @login="login"/>

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
import {BuilderId, Feature, IdC, LoginIdentifier, LoginOption, LongLivedIAM, Stage} from "../../model";

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
        mutateStage(stage: Stage) {
            this.$store.commit('setStage', stage)
        },
        handleBackButtonClick() {
            if (this.cancellable && this.stage === 'START') {
                window.ideApi.postMessage({ command: 'toggleBrowser' })
            }
            this.mutateStage('START')
        },
        handleCancelButton() {
            window.ideClient.cancelLogin()
            this.mutateStage('START')
            this.authorizationCode = undefined
        },
        changeTheme(darkMode: boolean) {
            const oldCssId = darkMode ? "jb-light" : "jb-dark"
            const newCssId = darkMode ? "jb-dark" : "jb-light"
            document.body.classList.add(newCssId);
            document.body.classList.remove(oldCssId);
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
                window.ideApi.postMessage({ command: 'loginBuilderId' })
            } else if (type instanceof LongLivedIAM) {
                window.ideApi.postMessage({
                    command: 'loginIAM',
                    profileName: type.profileName,
                    accessKey: type.accessKey,
                    secretKey: type.secret
                })
            }
        }
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
