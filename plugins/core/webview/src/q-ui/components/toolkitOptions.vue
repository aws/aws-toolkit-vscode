<!-- Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<template>
    <div @keydown.enter="handleContinueClick">
        <div class="title font-amazon bottom-small-gap" v-if="existingLogin.id === -1">Choose a sign-in option:</div>
        <SelectableItem
            v-if="feature === 'codecatalyst'"
            @toggle="toggleItemSelection"
            :isSelected="selectedLoginOption === LoginOption.BUILDER_ID"
            :itemId="LoginOption.BUILDER_ID"
            :itemTitle="'Use for free'"
            :itemText="'No AWS account required'"
            class="font-amazon bottom-small-gap"
        ></SelectableItem>
        <!-- TODO: IdC description undecided -->
        <SelectableItem
            @toggle="toggleItemSelection"
            :isSelected="selectedLoginOption === LoginOption.ENTERPRISE_SSO"
            :itemId="LoginOption.ENTERPRISE_SSO"
            :itemTitle="'Use professional license'"
            :itemText="'Sign in to AWS with single sign-on'"
            class="font-amazon bottom-small-gap"
        ></SelectableItem>
        <SelectableItem
            v-if="feature === 'awsExplorer'"
            @toggle="toggleItemSelection"
            :isSelected="selectedLoginOption === LoginOption.IAM_CREDENTIAL"
            :itemId="LoginOption.IAM_CREDENTIAL"
            :itemTitle="'IAM Credentials'"
            :itemText="'Store keys for use with AWS CLI tools'"
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
import {Feature, Stage, LoginIdentifier, BuilderId} from "../../model";

export default defineComponent({
    name: "loginOptions",
    components: {SelectableItem},
    props: {
        app: String
    },
    computed: {
        stage(): Stage {
            return this.$store.state.stage
        },
        feature(): Feature {
            return this.$store.state.feature
        }
    },
    data() {
        return {
            existingLogin: { id: -1, text: '', title: '' },
            selectedLoginOption: LoginIdentifier.NONE,
            LoginOption: LoginIdentifier
        }
    },
    methods: {
        toggleItemSelection(itemId: number) {
            this.selectedLoginOption = itemId
        },
        handleBackButtonClick() {
            this.$emit('backToMenu')
        },
        async handleContinueClick() {
            if (this.selectedLoginOption === LoginIdentifier.BUILDER_ID) {
                this.$emit('login', new BuilderId())
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

<style scoped lang="scss">
</style>
