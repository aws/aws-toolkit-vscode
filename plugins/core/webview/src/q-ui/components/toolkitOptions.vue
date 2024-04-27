<!-- Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<template>
    <div @keydown.enter="handleContinueClick">
        <div class="font-amazon" v-if="existConnections.length > 0">
            <div class="title bottom-small-gap">Connect with an existing account:</div>
            <div v-for="(connection, index) in this.existConnections" :key="index">
                <SelectableItem
                    @toggle="toggleItemSelection"
                    :isSelected="selectedLoginOption === connection.id"
                    :itemId="connection.id"
                    :login-type="this.connectionType(connection)"
                    :itemTitle="this.connectionDisplayedName(connection)"
                    :itemText="this.connectionTypeDescription(connection)"
                    class="bottom-small-gap"
                ></SelectableItem>
            </div>
        </div>

        <div class="title font-amazon bottom-small-gap">Choose a sign-in option:</div>
        <SelectableItem
            v-if="feature === 'codecatalyst'"
            @toggle="toggleItemSelection"
            :isSelected="selectedLoginOption === LoginOption.BUILDER_ID"
            :itemId="LoginOption.BUILDER_ID"
            :login-type="LoginOption.BUILDER_ID"
            :itemTitle="'Use for free'"
            :itemText="'No AWS account required'"
            class="font-amazon bottom-small-gap"
        ></SelectableItem>
        <!-- TODO: IdC description undecided -->
        <SelectableItem
            @toggle="toggleItemSelection"
            :isSelected="selectedLoginOption === LoginOption.ENTERPRISE_SSO"
            :itemId="LoginOption.ENTERPRISE_SSO"
            :login-type="LoginOption.ENTERPRISE_SSO"
            :itemTitle="'Workforce'"
            :itemText="'Sign in to AWS with single sign-on'"
            class="font-amazon bottom-small-gap"
        ></SelectableItem>
        <SelectableItem
            v-if="feature === 'awsExplorer'"
            @toggle="toggleItemSelection"
            :isSelected="selectedLoginOption === LoginOption.IAM_CREDENTIAL"
            :itemId="LoginOption.IAM_CREDENTIAL"
            :login-type="LoginOption.IAM_CREDENTIAL"
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
import {Feature, Stage, LoginIdentifier, BuilderId, AwsBearerTokenConnection, SONO_URL, ExistConnection} from "../../model";
import {AWS_BUILDER_ID_NAME, IDENTITY_CENTER_NAME} from "../../constants";

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
        },
        existConnections(): AwsBearerTokenConnection[] {
            return this.$store.state.existingConnections
        }
    },
    data() {
        return {
            selectedLoginOption: LoginIdentifier.NONE as string,
            existingLogin: { id: -1, text: '', title: '' },
            LoginOption: LoginIdentifier
        }
    },
    methods: {
        toggleItemSelection(itemId: string) {
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
            } else {
                // TODO: else ... is not precise
                // TODO: should pass the entire connection json obj instead of connection id only
                this.$emit('login', new ExistConnection(this.selectedLoginOption))
            }
        },
        // TODO: duplicates in qOptions, should leverage model/LoginOption interface
        connectionType(connection: AwsBearerTokenConnection): LoginIdentifier {
            if (connection.startUrl === SONO_URL) {
                return LoginIdentifier.BUILDER_ID
            }

            return LoginIdentifier.ENTERPRISE_SSO
        },
        // TODO: duplicates in qOptions, should leverage model/LoginOption interface
        connectionTypeDescription(connection: AwsBearerTokenConnection): string {
            if (connection.startUrl === SONO_URL) {
                return AWS_BUILDER_ID_NAME
            }

            return IDENTITY_CENTER_NAME
        },
        // TODO: duplicates in qOptions, should leverage model/LoginOption interface
        connectionDisplayedName(connection: AwsBearerTokenConnection): string {
            return `${connection.startUrl}`
        }
    }
})
</script>

<style scoped lang="scss">
</style>
