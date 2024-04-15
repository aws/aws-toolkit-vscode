<!-- Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<!-- This Vue File is the login webview of AWS Toolkit and Amazon Q.-->
<template>
    <div v-bind:class="[disabled ? 'disabled-form' : '']" class="auth-container" @click="handleDocumentClick">

        <Logo
            :app="app"
            :is-connected="stage === 'CONNECTED'"
        />

        <LoginOptions :app="app" v-if="stage === 'START'" @stageChanged="mutateStage"/>
        <SsoLoginForm v-if="stage === 'SSO_FORM'" @backToMenu="handleBackButtonClick" @stageChanged="mutateStage"/>
        <AwsProfileForm v-if="stage === 'AWS_PROFILE'" @backToMenu="handleBackButtonClick"/>

        <template v-if="stage === 'AUTHENTICATING'">
            <div class="font-amazon">
                <div v-if="app === 'TOOLKIT' && profileName.length > 0" class="title">Authenticating...</div>
                <div v-else>
                    <div class="title bottom-small-gap">Authenticating in browser...</div>
                    <div v-if="authorizationCode?.length !== 0" class="confirmation-code-container bottom-small-gap">
                        <div class="hint">CONFIRMATION CODE</div>
                        <div class="confirmation-code">{{ this.authorizationCode }}</div>
                    </div>
                </div>
                <button
                    class="login-flow-button cancel-button font-amazon"
                    v-on:click="handleCancelButton()"
                    :disabled="!isAuthorizationInProgress">Cancel
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
import {Stage} from "../../model";

enum LoginOption {
    NONE,
    BUILDER_ID,
    ENTERPRISE_SSO,
    IAM_CREDENTIAL,
    EXISTING_LOGINS,
}

function isBuilderId(url: string) {
    return url === 'https://view.awsapps.com/start'
}
export default defineComponent({
    name: 'Login',
    components: {
        Logo,
        SsoLoginForm,
        LoginOptions,
        AwsProfileForm
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
        },
    },
    data() {
        return {
            existingLogin: { id: -1, text: '', title: '' },
            selectedLoginOption: LoginOption.NONE,
            app: this.app,
            LoginOption,
            profileName: '',
        }
    },
    computed: {
        stage(): Stage {
            return this.$store.state.stage
        },
        authorizationCode(): string | undefined {
            return this.$store.state.authorizationCode
        },
        isAuthorizationInProgress(): boolean {
            return this.authorizationCode !== undefined
        }
    },
    methods: {
        mutateStage(stage: Stage) {
            this.$store.commit('setStage', stage)
        },
        handleDocumentClick(event: any) {
            const isClickInsideSelectableItems = event.target.closest('.item-container')
            if (!isClickInsideSelectableItems) {
                this.selectedLoginOption = 0
            }
        },
        handleBackButtonClick() {
            this.mutateStage('START')
        },
        handleCancelButton() {
            window.ideClient.cancelLogin()
        },
        changeTheme(darkMode: boolean) {
            const oldCssId = darkMode ? "jb-light" : "jb-dark"
            const newCssId = darkMode ? "jb-dark" : "jb-light"
            document.body.classList.add(newCssId);
            document.body.classList.remove(oldCssId);
        },
    },
    mounted() {
        window.changeTheme = this.changeTheme.bind(this)
    },
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
