/*! * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */

<script src="./samInvokeFrontend" lang="ts"></script>
<style scoped src="./samInvoke.css"></style>

<template>
    <div class="container">
        <form class="invoke-lambda-form">
            <h1>SAM invoke and debug configuration</h1>
            <div class="header-buttons" id="invoke-button-container">
                <button class="primary-button" :style="{ width: '20%' }" v-on:click.prevent="launch">Invoke</button>
                <select
                    name="selectedConfig"
                    v-model="selectedConfig"
                    on-change="updateConfig"
                    :style="{ width: '100%' }"
                >
                    <option disabled selected>create a new Config</option>
                    <option v-for="(config, index) in loadedConfigs" v-bind:value="config" :key="index">
                        {{ config.label }}
                    </option>
                </select>
                <button class="secondary-button" :style="{ width: '10%' }" v-on:click.prevent="save">Save</button>
                <button class="secondary-button" :style="{ width: '10%' }" v-on:click.prevent="reset">Reset</button>
                <button class="secondary-button" :style="{ width: '10%' }" v-on:click.prevent="create">Create</button>
                <div v-if="newConfigName">
                    <span class="unsaved">
                        {{ savedStatus }}
                    </span>
                </div>
            </div>
            <p>
                <em>
                    Using this form you can create, edit, and run launch-configs of <code>type:aws-sam</code>. When you
                    <strong>Invoke</strong> the launch config, {{ company }} Toolkit calls SAM CLI and attaches the
                    debugger to the code running in a local Docker container. open
                    <a href="#" @click.prevent="openLaunchJson">launch.json</a>.
                </em>
            </p>
            <settings-panel id="config-panel" title="General Configuration" description="" :start-collapsed="false">
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
                                        v-model="payloadOption"
                                        name="payload_request"
                                    />
                                    <label class="label-selector" for="sampleEvents">Inline</label><br />
                                </div>
                                <div class="formfield">
                                    <input
                                        class="radio-selector"
                                        type="radio"
                                        id="localFile"
                                        value="localFile"
                                        v-model="payloadOption"
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
                                        v-model="payloadOption"
                                        name="payload_request"
                                    />
                                    <label class="label-selector" for="savedEvents"> Remote saved events</label>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
                <div class="form-row" v-if="payloadOption === 'sampleEvents'">
                    <label :style="{ fontSize: '13px', fontWeight: 500 }">Sample event</label>
                    <button class="secondary-button" style="width: 140px" v-on:click.prevent="loadPayload">
                        Select an Event</button
                    ><br />
                    <span class="data-view">payload from data: {{ payload }} </span>
                    <div class="input-validation" v-if="payload.errorMsg">
                        Error parsing JSON: {{ payload.errorMsg }}
                    </div>
                </div>
                <div v-if="payloadOption === 'localFile'" class="form-row">
                    <div><label>File</label></div>
                    <div>
                        <input type="file" id="file" @change="onFileChange" style="display: none" ref="fileInput" />
                        <button v-on:click.prevent="promptForFileLocation" class="secondary-button">Choose file</button>
                        <button v-on:click.prevent="reloadFile" class="secondary-button">Reload</button>
                        &nbsp; {{ selectedFile || 'No file selected' }}
                        <span class="data-view">payload from data: {{ payload }} </span>
                        <div class="input-validation" v-if="payload.errorMsg">
                            Error parsing JSON: {{ payload.errorMsg }}
                        </div>
                    </div>
                </div>
                <div v-if="payloadOption === 'savedEvents'" class="form-row">
                    <div><label>Remote event</label></div>
                    <div class="form-row">
                        <div>
                            <select
                                class="form-row-event-select"
                                v-model="selectedTestEvent"
                                v-on:change="newSelection"
                            >
                                <option disabled value="">Select an Event</option>
                                <option v-for="item in TestEvents">
                                    {{ item }}
                                </option>
                            </select>
                        </div>
                        <div style="margin-left: 105px">
                            <button v-on:click.prevent="showNameField" class="secondary-button">Create</button>
                            <button v-on:click.prevent="saveEvent" class="secondary-button">Save</button>
                        </div>
                    </div>
                    <div class="form-row" v-if="showNameInput">
                        <label>Name</label>
                        <input
                            :style="{ zIndex: '2' }"
                            type="text"
                            v-model="newTestEventName"
                            placeholder="Enter event name"
                        />
                    </div>
                    <br />
                    <div class="form-row" v-if="showNameInput">
                        <label :style="{ fontSize: '13px', fontWeight: 500 }">Sample event</label>
                        <button class="secondary-button" style="width: 140px" v-on:click.prevent="loadPayload">
                            Select an Event</button
                        ><br />
                        <span class="data-view">payload from data: {{ payload }} </span>
                        <div class="input-validation" v-if="payload.errorMsg">
                            Error parsing JSON: {{ payload.errorMsg }}
                        </div>
                    </div>
                </div>
                <textarea
                    style="width: 100%; margin-bottom: 10px"
                    rows="5"
                    cols="60"
                    v-model="payload.value"
                ></textarea>
                <div class="config-item">
                    <label for="target-type-selector">Invoke Target Type</label>
                    <select name="target-types" id="target-type-selector" v-model="launchConfig.invokeTarget.target">
                        <option v-bind:value="type.value" v-for="(type, index) in targetTypes" :key="index">
                            {{ type.name }}
                        </option></select
                    ><span class="data-view">{{ launchConfig.invokeTarget.target }}</span>
                </div>
                <div class="target-code" v-if="launchConfig.invokeTarget.target === 'code'">
                    <div class="config-item">
                        <label for="select-directory">Project Root</label>
                        <input
                            id="select-directory"
                            type="text"
                            v-model="launchConfig.invokeTarget.projectRoot"
                            placeholder="Enter a directory"
                        />
                        <span class="data-view"
                            >the selected directory: {{ launchConfig.invokeTarget.projectRoot }}</span
                        >
                    </div>
                    <div class="config-item">
                        <label for="lambda-handler">Lambda Handler</label>
                        <input
                            type="text"
                            placeholder="Enter the lambda handler"
                            name="lambda-handler"
                            id="lambda-handler"
                            v-model="launchConfig.invokeTarget.lambdaHandler"
                        />
                        <span class="data-view">lamda handler :{{ launchConfig.invokeTarget.lambdaHandler }}</span>
                    </div>
                    <div class="config-item">
                        <label for="runtime-selector">Runtime</label>
                        <select name="runtimeType" v-model="launchConfig.lambda.runtime">
                            <option disabled>Choose a runtime...</option>
                            <option v-for="(runtime, index) in runtimes" v-bind:value="runtime" :key="index">
                                {{ runtime }}
                            </option>
                        </select>
                        <span class="data-view">runtime in data: {{ launchConfig.lambda.runtime }}</span>
                    </div>
                </div>
                <div class="target-template" v-else-if="launchConfig.invokeTarget.target === 'template'">
                    <div class="config-item">
                        <label for="template-path">Template Path</label>
                        <input
                            id="template-path-button"
                            type="text"
                            v-model="launchConfig.invokeTarget.templatePath"
                            placeholder="Enter the template path..."
                        /><span class="data-view"
                            >Template path from data: {{ launchConfig.invokeTarget.templatePath }}</span
                        >
                    </div>
                    <div class="config-item">
                        <label for="logicalID">Resource (Logical Id)</label>
                        <div class="form-row">
                            <input
                                name="template-logical-id"
                                :style="{ width: '190%' }"
                                id="template-logical-id"
                                type="text"
                                placeholder="Enter a resource"
                                v-model="launchConfig.invokeTarget.logicalId"
                            /><button
                                class="margin-bottom-16"
                                :style="{ width: '45%', height: '100%', padding: '2px 2px', marginLeft: '60%' }"
                                v-on:click.prevent="loadResource"
                            >
                                Select Resource
                            </button>
                            <span class="data-view">
                                Logical Id from data: {{ launchConfig.invokeTarget.logicalId }}</span
                            >
                        </div>
                    </div>
                    <div class="config-item">
                        <label for="runtime-selector">Runtime</label>
                        <select name="runtimeType" v-model="launchConfig.lambda.runtime">
                            <option disabled>Choose a runtime...</option>
                            <option v-for="(runtime, index) in runtimes" v-bind:value="runtime" :key="index">
                                {{ runtime }}
                            </option>
                        </select>
                        <span class="data-view">runtime in data: {{ launchConfig.lambda.runtime }}</span>
                    </div>
                </div>
                <div class="target-apigw" v-else-if="launchConfig.invokeTarget.target === 'api'">
                    <button v-on:click.prevent="loadResource">Load Resource</button><br />
                    <div class="config-item">
                        <label for="template-path">Template Path</label>
                        <input
                            id="template-path-button"
                            type="text"
                            v-model="launchConfig.invokeTarget.templatePath"
                            placeholder="Enter the template path..."
                        /><span class="data-view"
                            >Template path from data: {{ launchConfig.invokeTarget.templatePath }}</span
                        >
                    </div>
                    <div class="config-item">
                        <label for="logicalID">Resource (Logical Id)</label>
                        <input
                            name="template-logical-id"
                            id="template-logical-id"
                            type="text"
                            placeholder="Enter a resource"
                            v-model="launchConfig.invokeTarget.logicalId"
                        />
                    </div>
                    <div class="config-item">
                        <label for="runtime-selector">Runtime</label>
                        <select name="runtimeType" v-model="launchConfig.lambda.runtime">
                            <option disabled>Choose a runtime...</option>
                            <option v-for="(runtime, index) in runtimes" v-bind:value="runtime" :key="index">
                                {{ runtime }}
                            </option>
                        </select>
                        <span class="data-view">runtime in data: {{ launchConfig.lambda.runtime }}</span>
                    </div>
                    <div class="config-item">
                        <label for="path">Path</label>
                        <input type="text" v-model="launchConfig.api.path" />
                    </div>
                    <div class="config-item">
                        <label for="http-method-selector">HTTP Method</label>
                        <select name="http-method" v-model="launchConfig.api.httpMethod">
                            <option disabled>Choose an HTTP Method</option>
                            <option
                                v-for="(method, index) in httpMethods"
                                v-bind:value="method.toLowerCase()"
                                :key="index"
                            >
                                {{ method }}
                            </option></select
                        ><span class="data-view">{{ launchConfig.api.httpMethod }}</span>
                    </div>
                    <div class="config-item">
                        <label for="query-string">Query String</label>
                        <input
                            name="query-string"
                            id="query-string"
                            type="text"
                            cols="15"
                            rows="2"
                            placeholder="Enter a query"
                            v-model="launchConfig.api.querystring"
                        />
                    </div>
                    <div class="config-item">
                        <label for="headers">Headers</label>
                        <input
                            type="text"
                            v-model="headers.value"
                            placeholder="Enter as valid JSON"
                            :data-invalid="!!headers.errorMsg"
                        />
                        <div class="input-validation col2" v-if="headers.errorMsg">
                            Error parsing JSON: {{ headers.errorMsg }}
                        </div>
                    </div>
                </div>
                <div v-else>Select an Invoke Target</div>
            </settings-panel>
            <settings-panel id="more-fields-panel" title="Additional Fields" description="" start-collapsed>
                <h3>aws</h3>
                <div class="config-item">
                    <label for="awsConnection">Credentials:</label>
                    <input type="text" v-model="launchConfig.aws.credentials" />
                </div>
                <div class="config-item">
                    <label for="region">Region</label>
                    <input type="text" v-model="launchConfig.aws.region" />
                </div>
                <h3>lambda</h3>
                <div class="config-item">
                    <label for="">Environment Variables</label>
                    <input
                        type="text"
                        placeholder="Enter as valid JSON"
                        v-model="environmentVariables.value"
                        :data-invalid="!!environmentVariables.errorMsg"
                    />
                    <div class="input-validation col2" v-if="environmentVariables.errorMsg">
                        Error parsing JSON: {{ environmentVariables.errorMsg }}
                    </div>
                </div>
                <div class="config-item">
                    <label for="memory">Memory (MB)</label>
                    <input type="number" v-model.number="launchConfig.lambda.memoryMb" />
                </div>
                <div class="config-item">
                    <label for="timeoutSec">Timeout (s)</label>
                    <input type="number" v-model.number="launchConfig.lambda.timeoutSec" />
                </div>
                <!-- <div class="config-item">
                    <label for="pathMappings">Path Mappings</label>
                    <input type="text" v-model="launchConfig.lambda.pathMappings" >
                </div> -->
                <h3>sam</h3>
                <div class="config-item">
                    <label for="buildArguments">Build Arguments</label>
                    <input
                        type="text"
                        v-model="launchConfig.sam.buildArguments"
                        placeholder="Enter as a comma separated list"
                    />
                </div>
                <div class="config-item">
                    <label for="containerBuild">Container Build</label>
                    <input type="checkbox" name="containerBuild" id="containerBuild" v-model="containerBuild" />
                </div>
                <div class="config-item">
                    <label for="dockerNetwork">Docker Network</label>
                    <input type="text" v-model="launchConfig.sam.dockerNetwork" />
                </div>
                <div class="config-item">
                    <label for="localArguments">Local Arguments</label>
                    <input
                        type="text"
                        v-model="launchConfig.sam.localArguments"
                        placeholder="Enter as a comma separated list"
                    />
                </div>
                <div class="config-item">
                    <label for="skipNewImageCheck">Skip New Image Check</label>
                    <input
                        type="checkbox"
                        name="skipNewImageCheck"
                        id="skipNewImageCheck"
                        v-model="skipNewImageCheck"
                    />
                </div>
                <div class="config-item">
                    <label for="templateParameters">Template - Parameters</label>
                    <input type="text" v-model="parameters.value" :data-invalid="!!parameters.errorMsg" />
                    <div class="input-validation col2" v-if="parameters.errorMsg">
                        Error parsing JSON: {{ parameters.errorMsg }}
                    </div>
                </div>
                <h3>api</h3>
                <div class="config-item">
                    <label for="querystring">Query String</label>
                    <input type="text" v-model="launchConfig.api.querystring" />
                </div>
                <div class="config-item">
                    <label for="stageVariables">Stage Variables</label>
                    <input
                        type="text"
                        v-model="stageVariables.value"
                        :data-invalid="!!stageVariables.errorMsg"
                        placeholder="Enter as valid JSON"
                    />
                    <div class="input-validation col2" v-if="stageVariables.errorMsg">
                        Error parsing JSON: {{ stageVariables.errorMsg }}
                    </div>
                </div>
                <div class="config-item">
                    <label for="clientCerificateId">Client Certificate ID</label>
                    <input type="text" v-model="launchConfig.api.clientCertificateId" />
                </div>
                <div class="config-item">
                    <label for="apiPayload">API Payload</label>
                    <input
                        type="text"
                        v-model="apiPayload.value"
                        placeholder="Enter as valid JSON"
                        :data-invalid="!!apiPayload.errorMsg"
                    />
                    <div class="input-validation col2" v-if="apiPayload.errorMsg">
                        Error parsing JSON: {{ apiPayload.errorMsg }}
                    </div>
                </div>
            </settings-panel>
        </form>
    </div>
</template>
