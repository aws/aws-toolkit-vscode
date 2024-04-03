<!-- Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<template>
    <div class="auth-container-section">
        <div class="title" v-if="existingLogin.id === -1">Choose a sign-in option:</div>
        <SelectableItem
            v-if="app === 'AMAZONQ'"
            @toggle="toggleItemSelection"
            :isSelected="selectedLoginOption === LoginOption.BUILDER_ID"
            :itemId="LoginOption.BUILDER_ID"
            :itemText="'Create or sign-in using AWS Builder ID'"
            :itemTitle="'Personal'"
            class="selectable-item"
        ></SelectableItem>
        <SelectableItem
            @toggle="toggleItemSelection"
            :isSelected="selectedLoginOption === LoginOption.ENTERPRISE_SSO"
            :itemId="LoginOption.ENTERPRISE_SSO"
            :itemText="'Single sign-on with AWS IAM Identity Center'"
            :itemTitle="'Workforce'"
            class="selectable-item"
        ></SelectableItem>
        <SelectableItem
            v-if="app === 'TOOLKIT'"
            @toggle="toggleItemSelection"
            :isSelected="selectedLoginOption === LoginOption.IAM_CREDENTIAL"
            :itemId="LoginOption.IAM_CREDENTIAL"
            :itemText="'Store keys locally for use with AWS CLI tools'"
            :itemTitle="'IAM Credential'"
            class="selectable-item"
        ></SelectableItem>
        <button
            id="continue-button"
            class="continue-button"
            :disabled="selectedLoginOption === 0"
            v-on:click="handleContinueClick()"
        >
            Continue
        </button>
    </div>
</template>

<script lang="ts">
import {defineComponent} from 'vue'
import SelectableItem from "./selectableItem.vue";

enum LoginOption {
    NONE,
    BUILDER_ID,
    ENTERPRISE_SSO,
    IAM_CREDENTIAL,
    EXISTING_LOGINS,
}

export default defineComponent({
    name: "loginOptions",
    components: {SelectableItem},
    props: {
        app: String
    },
    data() {
        return {
            app: this.app,
            existingLogin: { id: -1, text: '', title: '' },
            selectedLoginOption: LoginOption.NONE,
            LoginOption
        }
    },
    methods: {
        toggleItemSelection(itemId: number) {
            this.selectedLoginOption = itemId
        },
        async handleContinueClick() {
            if (this.selectedLoginOption === LoginOption.BUILDER_ID) {
                console.log('builderId is selected')
                this.$emit('stageChanged', 'AUTHENTICATING')
                window.ideApi.postMessage({ command: 'loginBuilderId' })
            } else if (this.selectedLoginOption === LoginOption.ENTERPRISE_SSO) {
                this.$emit('stageChanged', 'SSO_FORM')
                window.ideApi.postMessage({ command: 'fetchSsoRegion' })
            } else if (this.selectedLoginOption === LoginOption.EXISTING_LOGINS) {
                this.$emit('stageChanged', 'START')
            } else if (this.selectedLoginOption === LoginOption.IAM_CREDENTIAL) {
                this.$emit('stageChanged', 'AWS_PROFILE')
            }
        },
    }
})
</script>

<style scoped>
.selectable-item {
    margin-bottom: 10px;
    margin-top: 10px;
}

.continue-button {
    background-color: #365880;
    color: white;
    width: 100%;
    height: 40px;
    border: none;
    border-radius: 5px;
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
</style>
