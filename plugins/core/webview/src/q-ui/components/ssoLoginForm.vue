<!-- Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<template>
    <div class="font-amazon" @keydown.enter="handleContinueClick">
        <div class="bottom-small-gap">
            <div class="title">Sign in with SSO:</div>
            <div class="code-catalyst-login" v-if="app === 'TOOLKIT'">
                <div class="hint">
                    Using CodeCatalyst with AWS Builder ID?
                    <a href="#" @click="handleCodeCatalystSignin()">Skip to sign-in</a>
                </div>
            </div>
        </div>
        <div>
            <div class="title no-bold">Start URL</div>
            <div class="hint">URL for your organization, provided by an admin or help desk</div>
            <input
                class="url-input font-amazon"
                type="text"
                id="startUrl"
                name="startUrl"
                v-model="startUrl"
                @change="handleUrlInput"
                tabindex="0"
                spellcheck="false"
            />
        </div>
        <br/>
        <div>
            <div class="title no-bold">Region</div>
            <div class="hint">AWS Region that hosts identity directory</div>
            <select
                class="region-select font-amazon"
                id="regions"
                name="regions"
                v-model="selectedRegion"
                @change="handleUrlInput"
                tabindex="0"
            >
                <option v-for="region in regions" :key="region.id" :value="region.id">
                    {{ `${region.name} (${region.id})` }}
                </option>
            </select>
        </div>
        <br/><br/>
        <button
            class="login-flow-button continue-button font-amazon"
            :disabled="!isInputValid"
            v-on:click="handleContinueClick()"
            tabindex="-1"
        >
            Continue
        </button>
    </div>
</template>

<script lang="ts">
import {defineComponent} from 'vue'
import {Feature, Region, IdC, BuilderId} from "../../model";

export default defineComponent({
    name: "ssoForm",
    props: {
        app: String
    },
    computed: {
        regions(): Region[] {
            return this.$store.state.ssoRegions
        },
        feature(): Feature {
            return this.$store.state.feature
        },
        startUrl: {
            get() {
                return this.$store.state.lastLoginIdcInfo.startUrl;
            },
            set(value: string) {
                window.ideClient.updateLastLoginIdcInfo({
                    ...this.$store.state.lastLoginIdcInfo,
                    startUrl: value
                })
            }
        },
        selectedRegion: {
            get() {
                return this.$store.state.lastLoginIdcInfo.region;
            },
            set(value: string) {
                window.ideClient.updateLastLoginIdcInfo({
                    ...this.$store.state.lastLoginIdcInfo,
                    region: value
                })
            }
        },
        isInputValid:  {
            get() {
                return this.startUrl != "" && this.selectedRegion != ""
            },
            set() {}
        }
    },
    methods: {
        handleUrlInput() {
            this.isInputValid = this.startUrl != "" && this.selectedRegion != "";
        },
        async handleContinueClick() {
            if (!this.isInputValid) {
                return
            }
            this.$emit('login', new IdC(this.startUrl, this.selectedRegion))
        },
        handleCodeCatalystSignin() {
            this.$emit('login', new BuilderId())
        }
    },
    mounted() {
        document.getElementById("ssoProfile")?.focus()
    }
})
</script>

<style scoped lang="scss">
.hint {
    color: #909090;
    margin-bottom: 5px;
    margin-top: 5px;
    font-size: 12px;
}

/* Theme specific styles */
body.jb-dark {
    .url-input, .region-select, .sso-profile {
        background-color: #252526;
        color: white;
        border: none;
    }
}

body.jb-light {
    .url-input, .region-select, .sso-profile {
        color: black;
        border: 1px solid #c9ccd6;
    }
}
</style>
