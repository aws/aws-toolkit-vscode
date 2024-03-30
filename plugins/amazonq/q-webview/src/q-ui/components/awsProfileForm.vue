<!-- Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<template>
    <button class="back-button" @click="handleBackButtonClick">
        <svg width="13" height="11" viewBox="0 0 13 11" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
                d="M4.98667 0.0933332L5.73333 0.786666L1.57333 4.94667H12.0267V5.96H1.57333L5.73333 10.0667L4.98667 10.8133L0.0266666 5.8V5.10667L4.98667 0.0933332Z"
                fill="#21A2FF"
            />
        </svg>
    </button>
    <div class="p">Profile Name</div>
    <div class="hint">The identifier for these credentials</div>
    <input class="iamInput" type="text" id="profileName" name="profileName" v-model="profileName"/>

    <br/><br/>
    <div class="p">Access Key</div>
    <input class="iamInput" type="text" id="accessKey" name="accessKey" v-model="accessKey"/>

    <br/><br/>
    <div class="p">Secret Key</div>
    <input class="iamInput" type="text" id="secretKey" name="secretKey" v-model="secretKey"/>

    <br/><br/>
    <button
        class="continue-button"
        :disabled="profileName.length <= 0 || accessKey.length <= 0 || secretKey.length <= 0"
        v-on:click="handleContinueClick()"
    >
        Continue
    </button>
</template>

<script lang="ts">
import {defineComponent} from 'vue'

export default defineComponent({
    name: "awsProfileForm",
    data() {
        return {
            profileName: '',
            accessKey: '',
            secretKey: '',
        }
    },
    methods: {
        async handleContinueClick() {
            this.$emit('stageChanged', 'AUTHENTICATING')
        },
        handleBackButtonClick() {
            this.$emit('backToMenu')
        },
    }
})
</script>

<style scoped>
.continue-button {
    background-color: #29a7ff;
    color: white;
    width: 100%;
    height: 40px;
}

.back-button {
    background: none;
    border: none;
    cursor: pointer;
    color: white;
    font-size: 30px;
}

.hint {
    color: #948a8a;
    margin-bottom: 5px;
    margin-top: 5px;
}

.continue-button:disabled {
    background-color: #252526;
    color: #6f6f6f;
}

.iamInput {
    background-color: #252526;
    width: 100%;
    color: white;
}

body.vscode-dark #logo-text {
    fill: white;
}

body.vscode-light #logo-text {
    fill: #232f3e; /* squid ink */
}
</style>
