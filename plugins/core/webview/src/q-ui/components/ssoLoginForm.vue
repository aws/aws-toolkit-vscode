<!-- Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<template>
    <button class="back-button" @click="handleBackButtonClick" tabindex="-1">
        <svg width="24" height="24" viewBox="0 -3 13 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
                d="M4.98667 0.0933332L5.73333 0.786666L1.57333 4.94667H12.0267V5.96H1.57333L5.73333 10.0667L4.98667 10.8133L0.0266666 5.8V5.10667L4.98667 0.0933332Z"
                fill="#21A2FF"
            />
        </svg>
    </button>
    <div class="font-amazon" @keydown.enter="handleContinueClick">
        <div class="title bottom-small-gap">Sign in with SSO:</div>
        <div>
            <div class="title no-bold">Profile Name</div>
            <div class="hint">User-specified name used to label credentials locally</div>
            <input
                class="sso-profile font-amazon"
                type="text"
                id="ssoProfile"
                name="ssoProfile"
                v-model="ssoProfile"
                tabindex="0"
                v-autofocus
                spellcheck="false"
            />
        </div>
        <br/>
        <div>
            <div class="title no-bold">Start URL</div>
            <div class="hint">URL for your organization, provided by an admin or help desk</div>
            <input
                class="url-input font-amazon url-part"
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
import {Region} from "../../model";

export default defineComponent({
    name: "ssoForm",
    computed: {
        regions(): Region[] {
            return this.$store.state.ssoRegions
        },
        ssoProfile: {
            get() {
                return this.$store.state.lastLoginIdcInfo.profileName;
            },
            set(value: string) {
                window.ideClient.updateLastLoginIdcInfo({
                    ...this.$store.state.lastLoginIdcInfo,
                    profileName: value
                })
            }
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
        handleBackButtonClick() {
            this.$emit('backToMenu')
        },
        async handleContinueClick() {
            if (!this.isInputValid) return
            window.ideApi.postMessage({
                command: 'loginIdC',
                url: this.startUrl,
                region: this.selectedRegion,
                profileName: this.ssoProfile
            })
            this.$emit('stageChanged', 'AUTHENTICATING')
        },
    },
    mounted() {
        document.getElementById("ssoProfile")?.focus()
        window.ideApi.postMessage({ command: 'fetchSsoRegion' })
        window.ideApi.postMessage({ command: 'fetchLastLoginIdcInfo' })
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

.sso-profile, .url-input, .region-select {
    height: 37px;
    border-radius: 4px;
}

.url-input, .sso-profile, .region-select {
    width: 100%;
}

.sso-profile, .url-input {
    padding-left: 10px;
    box-sizing: border-box;
}

.url-input {
    margin-left: 3px;
    margin-right: 3px;
}

.region-select {
    padding-left: 6px;
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
