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
            <div class="auth-container-section">
                <div v-if="app === 'TOOLKIT' && profileName.length > 0" class="title">Authenticating...</div>
                <div v-else>
                    <div class="title">Authenticating in browser...</div>
                    <div v-if="authorizationCode.length > 0" class="confirmationCodeContainer">
                        <div class="hint">CONFIRMATION CODE</div>
                        <div class="confirmationCode">{{ this.authorizationCode }}</div>
                    </div>
                </div>
                <button class="continue-button" v-on:click="handleCancelButton()">Cancel</button>
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
        authorizationCode(): string {
            return this.$store.state.authorizationCode
        }
    },
    methods: {
        mutateStage(stage: Stage) {
            this.$store.commit('setStage', stage)
        },
        handleDocumentClick(event: any) {
            const isClickInsideSelectableItems = event.target.closest('.selectable-item')
            if (!isClickInsideSelectableItems) {
                this.selectedLoginOption = 0
            }
        },
        handleBackButtonClick() {
            this.mutateStage('START')
        },
        handleCancelButton() {
            this.mutateStage('START')
        },
    },
})
</script>

<style>
.continue-button {
    background-color: #29a7ff;
    color: white;
    width: 100%;
    height: 40px;
}

.title {
    margin-bottom: 5px;
    margin-top: 5px;
    font-size: 15px;
    font-weight: bold;
    color: white;
}

.continue-button:disabled {
    background-color: #252526;
    color: #6f6f6f;
}

body.vscode-dark #logo-text {
    fill: white;
}

body.vscode-light #logo-text {
    fill: #232f3e; /* squid ink */
}

.confirmationCodeContainer {
    margin-top: 20px;
    border: 1px
}

.hint {
    color: #909090;
    margin-bottom: 5px;
    margin-top: 5px;
}

.confirmationCode {
    color: white;
    font-size: 32px;
    font-weight: bold;
}
</style>
