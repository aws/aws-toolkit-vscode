/*! * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */

<script src="./remoteInvokeFrontend" lang="ts"></script>
<style scoped src="./remoteInvoke.css"></style>

<template>
    <div class="Icontainer">
        <div><h1>Remote invoke configuration</h1></div>
        <div class="form-row" style="justify-content: space-between; height: 28px">
            <div>
                <button class="button-theme-primary" v-on:click="sendInput" :disabled="invokeInProgress">
                    <span v-if="invokeInProgress">Invoking...</span>
                    <span v-else>Remote Invoke</span>
                </button>
            </div>
            <div>
                <span
                    :style="{
                        width: '381px',
                        height: '16px',
                        fontWeight: '500',
                        fontSize: '13px',
                        lineHeight: '15.51px',
                    }"
                    >Function Name: {{ initialData.FunctionName }}</span
                >
            </div>
        </div>

        <div class="form-row">
            <label>Resource ARN</label>
            <span class="dynamic-span">{{ initialData.FunctionArn }}</span>
        </div>
        <div class="form-row">
            <label>Region:</label>
            <span
                :style="{ width: '381px', height: '16px', fontWeight: '500', fontSize: '13px', lineHeight: '15.51px' }"
                >{{ initialData.FunctionRegion }}</span
            >
        </div>
        <div class="form-row">
            <div><label>Payload:</label></div>
            <div class="payload-options">
                <div>
                    <form>
                        <div class="formfield">
                            <input
                                class="radio-selector"
                                type="radio"
                                id="sampleEvents"
                                value="sampleEvents"
                                v-model="payload"
                                name="payload_request"
                                checked
                            />
                            <label class="label-selector" for="sampleEvents">Inline</label><br />
                        </div>
                        <div class="formfield">
                            <input
                                type="radio"
                                id="localFile"
                                value="localFile"
                                v-model="payload"
                                name="payload_request"
                            />
                            <label class="label-selector" for="localFile"> Local file</label><br />
                        </div>
                        <div class="formfield">
                            <input
                                type="radio"
                                id="savedEvents"
                                value="savedEvents"
                                v-model="payload"
                                name="payload_request"
                                @change="$emit('loadRemoteTestEvents')"
                            />
                            <label class="label-selector" for="savedEvents"> Remote saved events</label>
                        </div>
                    </form>
                </div>
            </div>
        </div>
        <div v-if="payload === 'sampleEvents'" class="form-row">
            <label :style="{ fontSize: '13px', fontWeight: 500 }">Sample event</label>
            <div>
                <div>
                    <button class="button-theme-secondary" style="width: 140px" @click="loadSampleEvent">
                        Select an event
                    </button>
                </div>
                <br />
            </div>
            <br />
            <textarea style="width: 80%; margin-bottom: 10px" rows="5" cols="60" v-model="sampleText"></textarea>
        </div>
        <div v-if="payload === 'localFile'" class="form-row">
            <div><label>File</label></div>
            <div>
                <input type="file" id="file" @change="onFileChange" style="display: none" ref="fileInput" />
                <button @click="promptForFileLocation" class="button-theme-secondary">Choose file</button>
                &nbsp; {{ selectedFile || 'No file selected' }}
            </div>
        </div>
        <div v-if="payload === 'savedEvents'" class="form-row">
            <div><label>Remote event</label></div>
            <div class="form-row">
                <div>
                    <select class="form-row-event-select" v-model="selectedTestEvent" v-on:change="newSelection">
                        <option disabled value="">Select an event</option>
                        <option v-for="item in initialData.TestEvents">
                            {{ item }}
                        </option>
                    </select>
                </div>
                <div style="margin-left: 105px">
                    <button @click="showNameField" class="button-theme-secondary">Create</button>&nbsp;
                    <button @click="saveEvent" class="button-theme-secondary">Save</button>
                </div>
            </div>
            <div class="form-row" v-if="showNameInput">
                <label>Name</label>
                <input :style="{ zIndex: '2' }" type="text" v-model="newTestEventName" placeholder="Enter event name" />
            </div>
            <br />
            <div class="form-row" v-if="showNameInput">
                <label :style="{ fontSize: '13px', fontWeight: 500 }">Sample event</label>
                <button class="button-theme-secondary" style="width: 140px" @click="loadSampleEvent">
                    Select an event
                </button>
            </div>
            <textarea style="width: 80%; margin-bottom: 10px" rows="5" cols="60" v-model="sampleText"></textarea>
        </div>
    </div>
</template>
