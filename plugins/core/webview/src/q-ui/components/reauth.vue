<!-- Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<template>
    <div class="centered-with-max-width">
        <button v-if="!this.authenticating && this.app === 'TOOLKIT'" class="back-button" @click="back" tabindex="-1">
            <svg width="24" height="24" viewBox="0 -3 13 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                    d="M4.98667 0.0933332L5.73333 0.786666L1.57333 4.94667H12.0267V5.96H1.57333L5.73333 10.0667L4.98667 10.8133L0.0266666 5.8V5.10667L4.98667 0.0933332Z"
                    fill="#21A2FF"
                />
            </svg>
        </button>

        <Authenticating v-if="this.authenticating" :selected-login-option="this.reauthLoginOption" @cancel="onClickCancelReauth"/>
        <div v-else>
            <div class="font-amazon bottom-small-gap title centered">{{ title }}</div>
            <div class="font-amazon bottom-small-gap title centered">Please re-authenticate to continue</div>

            <button
                class="login-flow-button continue-button font-amazon"
                v-on:click="reauth()"
            >
                Re-authenticate
            </button>

            <button
                class="login-flow-button font-amazon logout"
                v-on:click="signout()"
            >
                Sign out
            </button>
        </div>
    </div>
</template>


<script lang="ts">
import {defineComponent} from 'vue'
import {LoginIdentifier, LoginOption, Stage} from "../../model";
import Authenticating from "@/q-ui/components/authenticating.vue";

const reauthLoginOption: LoginOption = {
    id: LoginIdentifier.EXISTING_LOGINS,
    requiresBrowser(): boolean {
        return true
    }
}

export default defineComponent({
    name: "reauth",
    components: {Authenticating},
    props: {
        app: String
    },
    computed: {
        title(): String {
            if (this.app === 'AMAZONQ') {
                return 'Connection to Amazon Q Expired'
            }

            return 'Connection to AWS Toolkit Expired'
        },
        cancellable(): boolean {
            return this.$store.state.cancellable
        },
    },
    data() {
        return {
            authenticating: false,
            reauthLoginOption: reauthLoginOption
        }
    },
    methods: {
        signout() {
            window.ideApi.postMessage({command: 'signout'})
        },
        reauth() {
            this.authenticating = true
            window.ideApi.postMessage({command: 'reauth'})
            // TODO: what if users cancel re-auth, the view will return to start page, which is incorrect
        },
        onClickCancelReauth() {
            this.authenticating = false
            window.ideApi.postMessage({command: 'cancelLogin'})
        },
        back() {
            window.ideApi.postMessage({command: 'toggleBrowser'})
        }
    },
    mounted() {
        this.authenticating = false
    }
})
</script>

<style scoped lang="scss">
.centered {
    display: flex;
    justify-content: center;
}

.logout {
    color: #3574f0 !important;
    background: none;
}
</style>
