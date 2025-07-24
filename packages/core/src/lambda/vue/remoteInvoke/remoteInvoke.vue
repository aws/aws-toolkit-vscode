/*! * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */

<script src="./remoteInvokeFrontend" lang="ts"></script>
<style scoped src="./remoteInvoke.css"></style>

<template>
    <div class="Icontainer">
        <div><h1>Remote invoke configuration</h1></div>
        <div class="form-row" style="justify-content: flex-start; height: 28px; align-items: center">
            <div>
                <button class="button-theme-primary" v-on:click="sendInput">Remote Invoke</button>
            </div>
            <div>
                <info>Function Name: {{ initialData.FunctionName }}</info>
            </div>
        </div>

        <div class="form-row" style="justify-content: flex-start; height: 28px">
            <label>Resource ARN</label>
            <info-wrap>{{ initialData.FunctionArn }}</info-wrap>
        </div>
        <div class="form-row">
            <label>Region</label>
            <info-wrap>{{ initialData.FunctionRegion }}</info-wrap>
        </div>
        <div class="form-row">
            <label>Runtime</label>
            <info>{{ initialData.Runtime }}</info>
        </div>

        <!-- Remote Debugging Configuration -->
        <div>
            <div class="form-row">
                <div><label for="attachDebugger">Remote debugging</label></div>
                <div style="display: flex; align-items: center; gap: 5px">
                    <input
                        type="checkbox"
                        id="attachDebugger"
                        v-model="debugState.remoteDebuggingEnabled"
                        @change="debugPreCheck"
                        :disabled="!initialData.runtimeSupportsRemoteDebug || !initialData.remoteDebugLayer"
                        class="remote-debug-checkbox"
                        style="margin-right: 5px; vertical-align: middle"
                    />
                    <button v-if="debugState.isDebugging" class="button-theme-inline" v-on:click="removeDebugSetup">
                        Remove Debug Setup
                    </button>

                    <!-- <span>Timeout: {{ debugState.debugTimeRemaining }}s ⏱️</span> -->
                    <info v-if="debugState.isDebugging && debugState.showDebugTimer"
                        >Auto remove after 60 second of inactive time</info
                    >
                    <info
                        v-if="!initialData.runtimeSupportsRemoteDebug && !initialData.remoteDebugLayer"
                        style="color: var(--vscode-errorForeground)"
                    >
                        Runtime {{ initialData.Runtime }} and region {{ initialData.FunctionRegion }} don't support
                        remote debugging yet
                    </info>
                    <info
                        v-else-if="!initialData.runtimeSupportsRemoteDebug"
                        style="color: var(--vscode-errorForeground)"
                    >
                        Runtime {{ initialData.Runtime }} doesn't support remote debugging
                    </info>
                    <info v-else-if="!initialData.remoteDebugLayer" style="color: var(--vscode-errorForeground)">
                        Region {{ initialData.FunctionRegion }} doesn't support remote debugging yet
                    </info>
                </div>
            </div>

            <div style="margin-bottom: 10px">
                <info-wrap v-if="initialData.runtimeSupportsRemoteDebug && initialData.remoteDebugLayer">
                    Remote debugging is not recommended for production environments. The AWS Toolkit modifies your
                    function by deploying it with an additional layer to enable remote debugging. Your local code
                    breakpoints are then used to step through the remote function invocation.
                    <a href="https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/lambda-remote-debug.html"
                        >Learn more</a
                    >
                </info-wrap>
            </div>

            <div class="form-row-no-align" v-if="debugState.remoteDebuggingEnabled">
                <label>Local root path</label>
                <div>
                    <div
                        v-if="debugState.handlerFileAvailable"
                        style="margin-bottom: 3px"
                        class="handler-status-message"
                    >
                        <info-wrap
                            >Your handler file has been located. You can now set breakpoints in this file for debugging.
                            <a @click="openHandler">(open handler)</a>
                        </info-wrap>
                    </div>
                    <div
                        v-else-if="initialData.supportCodeDownload"
                        style="margin-bottom: 3px"
                        class="handler-status-message"
                    >
                        <info-wrap
                            >Specify the path to your local directory that contains the handler file for debugging, or
                            download the handler file from your deployed function.</info-wrap
                        >
                    </div>
                    <div v-else style="margin-bottom: 3px" class="handler-status-message">
                        <info-wrap
                            >Specify the path to your local directory that contains the handler file for
                            debugging.</info-wrap
                        >
                    </div>
                    <div style="display: flex; align-items: center; gap: 5px">
                        <input
                            type="text"
                            v-model="debugConfig.localRootPath"
                            placeholder="Enter local root path"
                            title="The path to your local project root directory containing the source code"
                            @input="openHandlerWithDelay"
                            style="flex-grow: 1; margin-right: 2px"
                        />
                        <button @click="promptForFolderLocation" class="button-theme-inline">Browse local code</button>
                        <button
                            v-if="initialData.supportCodeDownload"
                            @click="downloadRemoteCode"
                            class="button-theme-inline"
                            style="margin-left: 2px"
                        >
                            Download remote code
                        </button>
                    </div>
                </div>
            </div>

            <!-- Collapsible Remote Debug Additional Configuration -->
            <div class="collapsible-section" v-if="debugState.remoteDebuggingEnabled">
                <div class="collapsible-header" @click="toggleCollapsible">
                    <span>{{ uiState.isCollapsed ? '▶' : '▼' }} Remote debug additional configuration</span>
                </div>
                <div class="collapsible-content" v-if="!uiState.isCollapsed">
                    <div class="form-row-no-align">
                        <label>Remote root path</label>
                        <div class="form-double-row">
                            <info style="margin-bottom: 3px"
                                >Specify path to code directory on remote Lambda function.</info
                            >

                            <input
                                type="text"
                                v-model="debugConfig.remoteRootPath"
                                placeholder="default to /var/task, the directory of your deployed lambda code"
                                title="The path to the code on the remote Lambda function"
                            />
                        </div>
                    </div>

                    <div class="form-row-no-align">
                        <label>Debug port</label>
                        <div class="form-double-row">
                            <info style="margin-bottom: 3px"
                                >Specify the network port used for the debugger connection.</info
                            >
                            <input
                                type="number"
                                v-model="debugConfig.debugPort"
                                placeholder="default to 9229, the debug port that will be used for remote debugging"
                                title="The network port used for the debugger connection (default to 9229)"
                                :class="{ 'input-error': debugPortError !== '' }"
                            />
                            <div v-if="debugPortError" class="error-message">{{ debugPortError }}</div>
                        </div>
                    </div>

                    <div class="form-row">
                        <label for="shouldPublishVersionCheckbox">Publish version</label>
                        <div style="align-items: center">
                            <input
                                type="checkbox"
                                style="margin-right: 5px; vertical-align: middle"
                                id="shouldPublishVersionCheckbox"
                                v-model="debugConfig.shouldPublishVersion"
                            />
                            <info>Debug with version. If unchecked, Debug $Latest</info>
                        </div>
                    </div>

                    <div class="form-row">
                        <label>Other debug params</label>
                        <div class="form-double-row">
                            <input
                                type="text"
                                v-model="debugConfig.otherDebugParams"
                                placeholder='{"smartStep":true,"resolveSourceMapLocations":["out/**/*.js"]}'
                                title="Additional debug parameters specific to the runtime"
                                :class="{ 'input-error': otherDebugParamsError !== '' }"
                            />
                            <div v-if="otherDebugParamsError" class="error-message">{{ otherDebugParamsError }}</div>
                        </div>
                    </div>

                    <div class="form-row">
                        <label>Timeout override</label>
                        <div class="form-double-row">
                            <input
                                type="number"
                                v-model="debugConfig.lambdaTimeout"
                                placeholder="default to 900 (seconds), the time you can debug before lambda timeout, "
                                title="specify timeout you want for remote debugging"
                                :class="{ 'input-error': lambdaTimeoutError !== '' }"
                            />
                            <div v-if="lambdaTimeoutError" class="error-message">{{ lambdaTimeoutError }}</div>
                        </div>
                    </div>

                    <div class="form-row">
                        <label>Layer override</label>
                        <div class="form-double-row">
                            <input
                                type="text"
                                v-model="initialData.remoteDebugLayer"
                                placeholder="specify debug layer you want for remote debugging"
                                title="specify debug layer you want for remote debugging"
                                :class="{ 'input-error': lambdaLayerError !== '' }"
                            />
                            <div v-if="lambdaLayerError" class="error-message">{{ lambdaLayerError }}</div>
                        </div>
                    </div>

                    <!-- Node.js/JavaScript specific fields -->
                    <div v-if="hasRuntimePrefix('nodejs')" class="form-row">
                        <label for="sourceMapCheckbox">Source map</label>
                        <div style="align-items: center">
                            <input
                                type="checkbox"
                                style="margin-right: 5px; vertical-align: middle"
                                id="sourceMapCheckbox"
                                v-model="runtimeSettings.sourceMapEnabled"
                            />
                            <info>Enable source map support</info>
                        </div>
                    </div>

                    <div v-if="hasRuntimePrefix('nodejs')" class="form-row">
                        <label>Skip files</label>
                        <input
                            type="text"
                            v-model="runtimeSettings.skipFiles"
                            placeholder="default to /var/runtime/node_modules/**/*.js,<node_internals>/**/*.js"
                            title="The files to skip debugging"
                        />
                    </div>

                    <div v-if="hasRuntimePrefix('nodejs')" class="form-row">
                        <label>Out files</label>
                        <input
                            type="text"
                            v-model="runtimeSettings.outFiles"
                            placeholder="./dist/*,./build/*,./.aws-sam/build/<functionName>/*"
                            title="outFiles to parse sourceMap"
                        />
                    </div>

                    <!-- Python specific fields -->
                    <div v-if="hasRuntimePrefix('python')" class="form-row">
                        <label for="justMyCodeCheckbox">Just my code</label>
                        <div style="align-items: center">
                            <input
                                type="checkbox"
                                style="margin-right: 5px; vertical-align: middle"
                                id="justMyCodeCheckbox"
                                v-model="runtimeSettings.justMyCode"
                            />
                            <info>restricts debugging to user-written code only(ignore system lib)</info>
                        </div>
                    </div>

                    <!-- Java specific fields -->
                    <div v-if="hasRuntimePrefix('java')" class="form-row">
                        <label>Project name</label>
                        <input
                            type="text"
                            v-model="runtimeSettings.projectName"
                            placeholder="YourJavaProjectName"
                            title="The name of the Java project for debuging"
                        />
                    </div>
                </div>
            </div>
        </div>

        <!-- Payload Section (moved to bottom) -->
        <div>
            <div class="form-row-no-align">
                <div><label>Payload</label></div>
                <div class="payload-options">
                    <div>
                        <form>
                            <div class="formfield">
                                <input
                                    class="radio-selector"
                                    type="radio"
                                    id="sampleEvents"
                                    value="sampleEvents"
                                    v-model="uiState.payload"
                                    name="payload_request"
                                    checked
                                />
                                <label class="label-selector" for="sampleEvents">Inline</label><br />
                            </div>
                            <div class="formfield">
                                <input
                                    class="radio-selector"
                                    type="radio"
                                    id="localFile"
                                    value="localFile"
                                    v-model="uiState.payload"
                                    name="payload_request"
                                />
                                <label class="label-selector" for="localFile"> Local file</label><br />
                            </div>
                            <div class="formfield">
                                <input
                                    class="radio-selector"
                                    type="radio"
                                    id="savedEvents"
                                    value="savedEvents"
                                    v-model="uiState.payload"
                                    name="payload_request"
                                    @change="loadRemoteTestEvents"
                                />
                                <label class="label-selector" for="savedEvents"> Remote saved events</label>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
            <div v-if="uiState.payload === 'sampleEvents'" class="form-row-no-align">
                <label>Sample event</label>
                <div>
                    <div>
                        <button class="button-theme-secondary" style="width: 140px" @click="loadSampleEvent">
                            Select an event
                        </button>
                    </div>
                    <br />
                </div>
                <br />
                <textarea
                    style="margin-bottom: 10px"
                    :rows="textareaRows"
                    cols="60"
                    v-model="payloadData.sampleText"
                ></textarea>
            </div>
            <div v-if="uiState.payload === 'localFile'" class="form-row-no-align">
                <div><label>File</label></div>
                <div>
                    <input type="file" id="file" @change="onFileChange" style="display: none" ref="fileInput" />
                    <button @click="promptForFileLocation" class="button-theme-secondary">Choose file</button>
                    &nbsp; {{ payloadData.selectedFile || 'No file selected' }}
                </div>
            </div>
            <div v-if="uiState.payload === 'savedEvents'" class="form-row-no-align">
                <div><label>Remote event</label></div>
                <div class="form-row-no-align">
                    <div>
                        <select
                            class="form-row-event-select"
                            v-model="payloadData.selectedTestEvent"
                            v-on:change="newSelection"
                        >
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
                <div class="form-row" v-if="uiState.showNameInput">
                    <label>Name</label>
                    <input
                        :style="{ zIndex: '2' }"
                        type="text"
                        v-model="payloadData.newTestEventName"
                        placeholder="Enter event name"
                    />
                </div>
                <br />
                <div class="form-row-no-align" v-if="uiState.showNameInput">
                    <label :style="{ fontSize: '13px', fontWeight: 500 }">Sample event</label>
                    <button class="button-theme-secondary" style="width: 140px" @click="loadSampleEvent">
                        Select an event
                    </button>
                </div>
                <textarea
                    style="margin-bottom: 10px"
                    :rows="textareaRows"
                    cols="60"
                    v-model="payloadData.sampleText"
                ></textarea>
            </div>
        </div>
    </div>
</template>
