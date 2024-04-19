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
    <div class="title no-bold">Profile Name</div>
    <div class="hint">The identifier for these credentials</div>
    <input class="iamInput font-amazon" type="text" id="profileName" name="profileName" v-model="profileName"/>

    <br/><br/>
    <div class="title no-bold">Access Key</div>
    <input class="iamInput font-amazon" type="text" id="accessKey" name="accessKey" v-model="accessKey"/>

    <br/><br/>
    <div class="title no-bold">Secret Key</div>
    <input class="iamInput font-amazon" type="text" id="secretKey" name="secretKey" v-model="secretKey"/>

    <br/><br/>
    <button
        class="login-flow-button continue-button"
        :disabled="profileName.length <= 0 || accessKey.length <= 0 || secretKey.length <= 0"
        v-on:click="handleContinueClick()"
    >
        Continue
    </button>
</template>

<script lang="ts">
import {defineComponent} from 'vue'
import {LongLivedIAM} from '../../model'

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
            this.$emit('stageChanged', 'AUTHENTICATING', new LongLivedIAM(this.profileName, this.accessKey, this.secretKey))
            window.ideApi.postMessage({
                command: 'loginIAM',
                profileName: this.profileName,
                accessKey: this.accessKey,
                secretKey: this.secretKey
            })
        },
        handleBackButtonClick() {
            this.$emit('backToMenu')
        },
    }
})
</script>

<style scoped lang="scss">
.back-button {
    background: none;
    border: none;
    cursor: pointer;
    color: white;
    font-size: 30px;
}

.hint {
    color: #909090;
    margin-bottom: 5px;
    margin-top: 5px;
    font-size: 12px;
}

.iamInput {
    background-color: #252526;
    width: 100%;
    height: 37px;
    border-radius: 4px;
}

/* Theme specific styles */
body.jb-dark {
    .iamInput {
        background-color: #252526;
        color: white;
        border: none;
    }
}

body.jb-light {
    .iamInput {
        color: black;
        border: 1px solid #c9ccd6;
    }
}
</style>
