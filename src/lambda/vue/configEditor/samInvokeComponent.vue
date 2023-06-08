/*! * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */

<script src="./samInvokeFrontend" lang="ts"></script>
<style scoped src="./samInvoke.css"></style>

<template>
    <form class="invoke-lambda-form">
        <h1>Edit SAM Debug Configuration</h1>
        <div class="container button-container" id="invoke-button-container">
            <button class="" v-on:click.prevent="launch">Invoke</button>
            <button class="form-buttons" v-on:click.prevent="loadConfig">Load Existing Config</button>
            <button class="form-buttons" v-on:click.prevent="save">Save</button>
        </div>
        <p>
            <em>
                Using this form you can create, edit, and run launch-configs of <code>type:aws-sam</code>. When you
                <strong>Invoke</strong> the launch config, {{ company }} Toolkit calls SAM CLI and attaches the debugger
                to the code running in a local Docker container.
            </em>
        </p>
        <settings-panel id="config-panel" title="Configuration" description="">
            <label for="target-type-selector">Invoke Target Type</label>
            <select name="target-types" id="target-type-selector" v-model="launchConfig.invokeTarget.target">
                <option v-bind:value="type.value" v-for="(type, index) in targetTypes" :key="index">
                    {{ type.name }}
                </option></select
            ><span class="data-view">{{ launchConfig.invokeTarget.target }}</span>
            <div class="target-code" v-if="launchConfig.invokeTarget.target === 'code'">
                <div class="config-item">
                    <label for="select-directory">Project Root</label>
                    <input
                        id="select-directory"
                        type="text"
                        v-model="launchConfig.invokeTarget.projectRoot"
                        placeholder="Enter a directory"
                    />
                    <span class="data-view">the selected directory: {{ launchConfig.invokeTarget.projectRoot }}</span>
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
                <button class="margin-bottom-16" v-on:click.prevent="loadResource">Load Resource</button><br />
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
                    /><span class="data-view"> Logical Id from data: {{ launchConfig.invokeTarget.logicalId }}</span>
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
                        <option v-for="(method, index) in httpMethods" v-bind:value="method.toLowerCase()" :key="index">
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
                <input type="checkbox" name="skipNewImageCheck" id="skipNewImageCheck" v-model="skipNewImageCheck" />
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
        <settings-panel id="payload-panel" title="Payload" description="" start-collapsed>
            <button class="margin-bottom-16" v-on:click.prevent="loadPayload">Load Sample Payload</button><br />
            <textarea name="lambda-payload" id="lambda-payload" cols="60" rows="5" v-model="payload.value"></textarea>
            <span class="data-view">payload from data: {{ payload }} </span>
            <div class="input-validation" v-if="payload.errorMsg">Error parsing JSON: {{ payload.errorMsg }}</div>
        </settings-panel>
    </form>
</template>
