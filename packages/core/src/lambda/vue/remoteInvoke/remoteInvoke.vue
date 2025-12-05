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
            <info-wrap
                >{{ initialData.FunctionRegion }}
                <b v-if="uiState.extraRegionInfo">{{ uiState.extraRegionInfo }}</b></info-wrap
            >
        </div>
        <div class="form-row">
            <label>Runtime</label>
            <info>{{ initialData.Runtime }}</info>
        </div>

        <!-- Remote Debugging Configuration -->
        <div>
            <div class="vscode-setting-item">
                <div class="setting-header">
                    <label class="setting-title">Remote debugging</label>
                    <button
                        v-if="debugState.isDebugging"
                        class="button-theme-inline"
                        v-on:click="removeDebugSetup"
                        style="margin-left: 10px"
                    >
                        Remove Debug Setup
                    </button>
                    <info v-if="debugState.isDebugging && debugState.showDebugTimer" style="margin-left: 10px"
                        >Auto remove after 60 second of inactive time</info
                    >
                </div>
                <div class="setting-body">
                    <input
                        type="checkbox"
                        id="attachDebugger"
                        v-model="debugState.remoteDebuggingEnabled"
                        @change="debugPreCheck"
                        :disabled="
                            !initialData.runtimeSupportsRemoteDebug ||
                            !initialData.remoteDebugLayer ||
                            (initialData.LambdaFunctionNode?.configuration as any).CapacityProviderConfig
                        "
                        class="remote-debug-checkbox"
                    />
                    <div class="setting-description">
                        <info-wrap
                            v-if="
                                initialData.runtimeSupportsRemoteDebug &&
                                initialData.remoteDebugLayer &&
                                initialData.LambdaFunctionNode?.configuration.SnapStart
                            "
                        >
                            Remote debugging is not recommended for production environments. The AWS Toolkit modifies
                            your function by deploying it with an additional layer to enable remote debugging. Your
                            local code breakpoints are then used to step through the remote function invocation.
                            <a
                                href="https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/lambda-remote-debug.html"
                                >Learn more</a
                            >
                        </info-wrap>
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
                        <info
                            v-else-if="(initialData.LambdaFunctionNode?.configuration as any).CapacityProviderConfig"
                            style="color: var(--vscode-errorForeground)"
                        >
                            Lambda Managed Instances Function doesn't support remote debugging yet
                        </info>
                    </div>
                </div>
            </div>

            <div class="vscode-setting-item" v-if="debugState.remoteDebuggingEnabled">
                <div class="setting-header">
                    <label class="setting-title">Local root path</label>
                </div>
                <div class="setting-description-full">
                    <info-wrap v-if="debugState.handlerFileAvailable">
                        Your handler file has been located. You can now <b>open handler</b> to set breakpoints in this
                        file for debugging.
                    </info-wrap>
                    <info-wrap v-else-if="initialData.supportCodeDownload">
                        <b>Browse</b> to specify the absolute path to your local directory that contains the handler
                        file for debugging. Or <b>Download</b> the handler file from your deployed function.
                    </info-wrap>
                    <info-wrap v-else>
                        <b>Browse</b> to specify the absolute path to your local directory that contains the handler
                        file for debugging.
                    </info-wrap>
                </div>
                <div class="setting-input-group-full">
                    <input
                        type="text"
                        v-model="debugConfig.localRootPath"
                        placeholder="Enter local root path"
                        title="The path to your local project root directory containing the source code"
                        @input="openHandlerWithDelay"
                        class="setting-input"
                    />
                    <button
                        @click="openHandler"
                        class="button-theme-inline"
                        :disabled="!debugState.handlerFileAvailable"
                        :title="
                            !debugState.handlerFileAvailable
                                ? 'Handler file not found. Please specify the correct local root path first.'
                                : 'Open handler file'
                        "
                    >
                        Open Handler
                    </button>
                    <button @click="promptForFolderLocation" class="button-theme-inline">Browse</button>
                    <button
                        v-if="initialData.supportCodeDownload"
                        @click="downloadRemoteCode"
                        class="button-theme-inline"
                    >
                        Download
                    </button>
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
                                placeholder="Default to /var/task, the directory of your deployed lambda code"
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
                                @input="onDebugPortChange"
                                :placeholder="
                                    initialData.isLambdaRemote
                                        ? 'Default to 9229, the debug port that will be used for remote debugging'
                                        : 'Default to a random debug port'
                                "
                                :title="
                                    initialData.isLambdaRemote
                                        ? 'The network port used for the debugger connection (default to 9229)'
                                        : 'The network port used for the debugger connection (default to a random port)'
                                "
                                :class="{ 'input-error': debugPortError !== '' }"
                            />
                            <div v-if="debugPortError" class="error-message">{{ debugPortError }}</div>
                        </div>
                    </div>

                    <div v-if="initialData.isLambdaRemote" class="form-row">
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

                    <div v-if="initialData.isLambdaRemote" class="form-row">
                        <label>Timeout override</label>
                        <div class="form-double-row">
                            <input
                                type="number"
                                v-model="debugConfig.lambdaTimeout"
                                placeholder="Default to 900 (seconds), the time you can debug before lambda timeout, "
                                title="Specify timeout you want for remote debugging"
                                :class="{ 'input-error': lambdaTimeoutError !== '' }"
                            />
                            <div v-if="lambdaTimeoutError" class="error-message">{{ lambdaTimeoutError }}</div>
                        </div>
                    </div>

                    <div v-if="initialData.isLambdaRemote" class="form-row">
                        <label>Layer override</label>
                        <div class="form-double-row">
                            <input
                                type="text"
                                v-model="initialData.remoteDebugLayer"
                                placeholder="Specify debug layer you want for remote debugging"
                                title="Specify debug layer you want for remote debugging"
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
                            placeholder="Default to /var/runtime/node_modules/**/*.js,<node_internals>/**/*.js"
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
                            title="The name of the Java project for debugging"
                        />
                    </div>
                </div>
            </div>
        </div>

        <!-- Payload Section -->
        <div class="vscode-setting-item">
            <div class="setting-header">
                <label class="setting-title">Payload</label>
            </div>
            <div class="setting-description-full">
                <info-wrap>
                    Enter the JSON payload for your Lambda function invocation. You can <b>Load sample event</b> from
                    AWS event templates, <b>Load local file</b> from your computer
                </info-wrap>
                <info-wrap v-if="initialData.isLambdaRemote"
                    ><b>Load remote event</b> from your saved test events. You can <b>Save as remote event</b> to save
                    the event below for future use</info-wrap
                >
            </div>
            <div class="payload-button-group">
                <button @click="loadSampleEvent" class="button-theme-inline">Load sample event</button>
                <button @click="promptForFileLocation" class="button-theme-inline">Load local file</button>
                <button v-if="initialData.isLambdaRemote" @click="loadRemoteTestEvents" class="button-theme-inline">
                    Load remote event
                </button>
                <button v-if="initialData.isLambdaRemote" @click="saveEvent" class="button-theme-inline">
                    Save as remote event
                </button>
            </div>
            <textarea
                class="payload-textarea"
                :rows="textareaRows"
                v-model="payloadData.sampleText"
                placeholder='{"key": "value"}'
            ></textarea>
        </div>
    </div>
</template>
