<!-- Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<template>
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

<script lang="ts">
import {defineComponent} from 'vue'
import {LoginIdentifier, LoginOption} from '../../model';

export default defineComponent({
    name: "authenticating",
    props: {
        selectedLoginOption: {
            type: Object as () => LoginOption,
            required: true
        }
    },
    methods: {
        handleCancelButton() {
            this.$emit('cancel')
            this.authorizationCode = undefined
        }
    },
    computed: {
        authorizationCode: {
            get() {
                return this.$store.state.authorizationCode
            },
            set(value: string | undefined) {
                this.$store.commit('setAuthorizationCode', value)
            }
        },
        requireConfirmationCodeOrNot(): boolean {
            return this.selectedLoginOption?.requiresBrowser() === true && this.authorizationCode?.length !== 0
        },
        authenticatingText(): string {
            if (this.selectedLoginOption?.id === LoginIdentifier.IAM_CREDENTIAL) {
                return 'Connecting to IAM...'
            }

            return 'Authenticating in browser...'
        }
    },
    mounted() {
        this.authorizationCode = undefined
    }
})
</script>

<style scoped lang="scss">
.confirmation-code {
    font-size: 48px;
    font-weight: bold;
}

.hint {
    color: #909090;
    margin-bottom: 5px;
    margin-top: 5px;
}
</style>
