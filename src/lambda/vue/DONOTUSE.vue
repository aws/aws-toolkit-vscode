<!--
    * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
    * SPDX-License-Identifier: Apache-2.0
    -->

<!--This is an experimental template that is not used directly.  -->

<template>
    <form class="invoke-lambda-form">
        <h1>Invoke Local Lambda</h1>
        <button v-on:click.prevent="loadConfig">Load Existing Debug Configuration</button><br />
        <div class="config-details">
            <h2>Configuration Details</h2>
            <label for="target-type-selector">Invoke Target Type</label>
            <select name="target-types" id="target-type-selector" v-model="launchConfig.invokeTarget.target">
                <option :value="type.value" v-for="(type, index) in targetTypes" :key="index">{{ type.name }}</option>
            </select>
            <div class="target-code" v-if="launchConfig.invokeTarget.target === 'code'">
                <div class="config-item">
                    <label for="select-directory">Project Root  <span class="tooltip">i<span class="tooltip-text"> Heplful tooltip with explanation and example: <br>Example path: home/folder/file</span></span></label>
                    <input
                        id="select-directory"
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
                    <select name="runtimeType" id="target-code-runtime" v-model="launchConfig.lambda.runtime">
                        <option disabled>Choose a runtime...</option>
                        <option v-for="(runtime, index) in runtimes" v-bind:value="runtime" :key="index">
                            {{ runtime }}
                        </option>
                    </select>
                    <span class="data-view">runtime in data: {{ launchConfig.lambda.runtime }}</span>
                </div>
            </div>
            <div class="target-template" v-else-if="launchConfig.invokeTarget.target === 'template'">
                <button v-on:click.prevent="loadResource">Load Resource</button><br />
                <div class="config-item">
                    <label for="template-path">Template Path  <span class="tooltip">i<span class="tooltip-text"> Heplful tooltip with explanation and example: <br>Example path: home/folder/file</span></span></label>
                    <input
                        id="template-path-button"
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
                        placeholder="Enter a resource"
                        v-model="launchConfig.invokeTarget.logicalId"
                    /><span class="data-view"> Logical Id from data: {{ launchConfig.invokeTarget.logicalId }}</span>
                </div>
            </div>
            <div class="target-apigw" v-else-if="launchConfig.invokeTarget.target === 'api'">
                <button v-on:click.prevent="loadResource">Load Resource</button><br />
                <div class="config-item">
                    <label for="template-path-api">Template Path</label>
                    <button id="template-path-api-button">Select Template...</button>
                </div>
                <div class="config-item">
                    <label for="logicalID">Resource (Logical Id)</label>
                    <input
                        name="template-logical-id"
                        id="template-logical-id"
                        placeholder="Enter a resource"
                        v-model="launchConfig.invokeTarget.logicalId"
                    />
                </div>
                <div class="config-item">
                    <label for="http-method-selector">HTTP Method</label>
                    <select name="http-method" id="http-method-selector">
                        <option :value="method" v-for="(method, index) in httpMethods" :key="index">
                            {{ method }}
                        </option>
                    </select>
                </div>
                <div class="config-item">
                    <label for="query-string">Query String</label>
                    <input name="query-string" id="query-string" cols="15" rows="2" placeholder="Enter a query" />
                </div>
                <div class="config-item">
                    <label for="">Headers</label>
                    <button id="template-path-api-button">Add Header...</button>
                </div>
            </div>
            <div v-else>Select an Invoke Target</div>
            <button @click="toggleShowAllFields">{{showAllFields ? "Less Fields" : "More Fields"}}</button>
            <div v-if="showAllFields">
                <h3>aws</h3>
                <div class="config-item">
                    <label for="awsConnection">Credentials:</label>
                    <input type="text" v-model="launchConfig.aws.credentials" >
                </div>
                <div class="config-item">
                    <label for="region">Region</label>
                    <input type="text" v-model="launchConfig.aws.region" >
                </div>
            </div>
        </div>
        <div class="payload-section">
            <h2>Payload</h2>
            <button v-on:click.prevent="loadPayload">Load Sample Payload</button><br />
            <textarea name="lambda-payload" id="lambda-payload" cols="60" rows="5" v-model="payload"></textarea>
            <span class="data-view">payload from data: {{ payload }} </span>
            <div class="json-parse-error" v-if="jsonError && payload">Error parsing JSON: {{jsonError}}</div>
        </div>
        <div class="invoke-button-container">
            <button v-on:click.prevent="save">Save Debug Configuration</button>
            <button id="invoke-button" v-on:click.prevent="launch">Invoke Debug Configuration</button>
        </div>
    </form>
</template>
