<!-- Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<template>
    <div @keydown.enter="handleContinueClick">
        <div class="title font-amazon bottom-small-gap" v-if="existingLogin.id === -1">Choose a sign-in option:</div>
        <SelectableItem
            v-if="app === 'AMAZONQ'"
            @toggle="toggleItemSelection"
            :isSelected="selectedLoginOption === LoginOption.BUILDER_ID"
            :itemId="LoginOption.BUILDER_ID"
            :itemText="'Create or sign-in using AWS Builder ID'"
            :itemTitle="'Personal'"
            class="font-amazon bottom-small-gap"
        ></SelectableItem>
        <SelectableItem
            @toggle="toggleItemSelection"
            :isSelected="selectedLoginOption === LoginOption.ENTERPRISE_SSO"
            :itemId="LoginOption.ENTERPRISE_SSO"
            :itemText="'Sign in to AWS with single sign-on'"
            :itemTitle="'Workforce'"
            class="font-amazon bottom-small-gap"
        ></SelectableItem>
        <SelectableItem
            v-if="app === 'TOOLKIT'"
            @toggle="toggleItemSelection"
            :isSelected="selectedLoginOption === LoginOption.IAM_CREDENTIAL"
            :itemId="LoginOption.IAM_CREDENTIAL"
            :itemText="'Store keys locally for use with AWS CLI tools'"
            :itemTitle="'IAM Credential'"
            class="font-amazon bottom-small-gap"
        ></SelectableItem>
        <button
            class="login-flow-button continue-button font-amazon"
            :disabled="selectedLoginOption === 0"
            v-on:click="handleContinueClick()"
            tabindex="-1"
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
            } else if (this.selectedLoginOption === LoginOption.EXISTING_LOGINS) {
                this.$emit('stageChanged', 'START')
            } else if (this.selectedLoginOption === LoginOption.IAM_CREDENTIAL) {
                this.$emit('stageChanged', 'AWS_PROFILE')
            }
        },
    }
})
</script>
