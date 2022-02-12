/*! * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */
<template>
    <div id="invoker-app">
        <div id="invoker-controls">
            <div id="top">
                <h1>AWS SDK Invoker</h1>
                <div id="selectors">
                    <div class="selector">
                        <div class="selector-heading">AWS Region</div>
                        <select v-model="currRegion">
                            <option disabled value="">Select AWS Region...</option>
                            <option v-for="region in initialData.regions" :key="region.id" :value="region.id">
                                {{ region.name }}
                            </option>
                        </select>
                    </div>
                    <div class="selector">
                        <div class="selector-heading">
                            <span
                                v-bind:class="{
                                    'doc-link': currServiceDefinition && currServiceDefinition.documentation,
                                }"
                                v-on:click="
                                    currServiceDefinition && currServiceDefinition.documentation
                                        ? showServiceDocumentation()
                                        : undefined
                                "
                            >
                                Service
                            </span>
                        </div>
                        <select v-model="currService" v-on:change="getService">
                            <option disabled selected hidden v-bind:value="undefined">Select AWS Service...</option>
                            <option v-for="service in initialData.services" :key="service" :value="service">
                                {{ service }}
                            </option>
                        </select>
                    </div>
                    <div class="selector">
                        <div class="selector-heading">
                            <span
                                v-bind:class="{
                                    'doc-link':
                                        currServiceDefinition &&
                                        currServiceDefinition.operations[currApi] &&
                                        currServiceDefinition.operations[currApi].documentation,
                                }"
                                v-on:click="
                                    currServiceDefinition &&
                                    currServiceDefinition.operations[currApi] &&
                                    currServiceDefinition.operations[currApi].documentation
                                        ? showApiDocumentation()
                                        : undefined
                                "
                            >
                                API
                            </span>
                        </div>
                        <select
                            v-model="currApi"
                            v-if="currServiceDefinition && currServiceDefinition.operations"
                            v-on:change="selectApi"
                        >
                            <option disabled selected hidden v-bind:value="undefined">Select a Service First...</option>
                            <option
                                v-for="api in Object.keys(currServiceDefinition.operations)"
                                :key="api"
                                :value="api"
                            >
                                {{ api }}
                            </option>
                        </select>
                        <select v-else>
                            <option disabled value="">Select AWS Service API...</option>
                        </select>
                    </div>
                </div>
                <div v-if="currDocumentation" id="documentation-container">
                    <h2>Documentation: {{ currDocumentation.component }}</h2>
                    <div id="service-documentation" v-html="currDocumentation.text"></div>
                </div>
            </div>
            <div id="inputs-container">
                <form id="inputs" v-if="currApiDefinition">
                    <SdkDefServiceCallShapeComponent
                        v-if="currApiDefinition.input"
                        :key="currApiDefinition.input.shape"
                        :val="currApiDefinition.input.shape"
                        :schema="currServiceDefinition.shapes[currApiDefinition.input.shape]"
                        :service="currServiceDefinition"
                        @updateRequest="handleUpdateRequest"
                        @showDoc="showArbitraryDocumentation"
                    />
                    <button
                        :disabled="pendingResponse"
                        id="submit-dryrun-button"
                        v-on:click.prevent="submitRequest(true)"
                    >
                        Generate Sample <strong>{{ currService }}.{{ currApi }}</strong> Call</button
                    ><br />
                    <button
                        :disabled="pendingResponse"
                        id="submit-request-button"
                        v-on:click.prevent="submitRequest(false)"
                    >
                        Call <strong>{{ currService }}.{{ currApi }}</strong>
                    </button>
                </form>
            </div>
        </div>
        <div>
            <div id="io-title">Most Recent Request {{ last ? `(${last.service}.${last.api})` : '' }}</div>
            <div id="input-output">
                <div class="service-io">
                    Request
                    <pre>{{ last && last.request ? last.request : '' }}</pre>
                </div>
                <div class="service-io">
                    Response
                    <pre v-bind:class="{ error: isResponseErr }">{{ response ? response : '' }}</pre>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../webviews/client'
// import saveData from '../../webviews/mixins/saveData'
import { InitialData, SdkAccessWebview } from '../sdkAccessBackend'
import { SdkDefDocumentation, SdkDefService, SdkDefServiceCall } from '../sdkDefs'
import SdkDefServiceCallShapeComponent from './SdkDefServiceCallShapeComponent.vue'

interface DataShape {
    initialData: InitialData
    currService: string
    currRegion: string
    currApi: string
    currServiceDefinition: SdkDefService | undefined
    currApiDefinition: SdkDefServiceCall | undefined
    currDocumentation: SdkDefDocumentation | undefined
    request: any
    response: any
    last: any
    isResponseErr: boolean
    pendingResponse: boolean
}

const defaultInitialData: InitialData = {
    services: [],
    regions: [],
    defaultRegion: '',
}

const client = WebviewClientFactory.create<SdkAccessWebview>()
export default defineComponent({
    components: {
        SdkDefServiceCallShapeComponent,
    },
    data: (): DataShape => ({
        initialData: defaultInitialData,
        currService: '',
        currRegion: '',
        currApi: '',
        currServiceDefinition: undefined,
        currApiDefinition: undefined,
        currDocumentation: undefined,
        request: {},
        response: undefined,
        last: undefined,
        isResponseErr: false,
        pendingResponse: false,
    }),
    async created() {
        this.initialData = (await client.init()) ?? this.initialData
        this.currRegion = this.initialData.defaultRegion ?? ''
        // incoming data
        client.onLoadedServiceDefinition(this.onLoadedServiceDefinition)
        client.onSDKResponse(this.onSDKResponse)
    },
    methods: {
        getService: function () {
            this.currApi = ''
            this.currApiDefinition = undefined
            this.request = {}
            client.getServiceDefinition(this.currService)
        },
        submitRequest: function (dryrun: boolean) {
            this.last = {
                service: this.currService,
                api: this.currApi,
                request: '...waiting for response...',
            }
            this.pendingResponse = true
            this.isResponseErr = false
            this.response = '...waiting for response...'
            client.makeSdkCall(
                { service: this.currService, region: this.currRegion, api: this.currApi },
                this.request,
                dryrun
            )
        },
        selectApi: function () {
            this.currApiDefinition = this.currServiceDefinition?.operations[this.currApi]
            this.request = {}
            this.showApiDocumentation()
        },
        handleUpdateRequest: function (key: string, incoming: any) {
            this.request = incoming[this.currApiDefinition!.input.shape]
        },
        onLoadedServiceDefinition: function (service: SdkDefService) {
            this.currServiceDefinition = service
            this.showServiceDocumentation()
        },
        showServiceDocumentation: function () {
            this.showArbitraryDocumentation({
                text: this.currServiceDefinition?.documentation
                    ? this.currServiceDefinition.documentation
                    : `[No documentation for ${this.currService}]`,
                component: `${this.currService} (Service)`,
            })
        },
        showApiDocumentation: function () {
            this.showArbitraryDocumentation({
                text: this.currServiceDefinition?.operations[this.currApi].documentation
                    ? this.currServiceDefinition?.operations[this.currApi].documentation
                    : `[No documentation for ${this.currApi}]`,
                component: `${this.currApi} (API)`,
            })
        },
        showArbitraryDocumentation: function (documentation: SdkDefDocumentation) {
            this.currDocumentation = documentation
        },
        onSDKResponse: function (response: any) {
            this.pendingResponse = false
            this.last.request = response.request
            if (response.ERROR) {
                this.isResponseErr = true
                this.response = response.ERROR
            } else {
                this.response = response.response
            }
        },
    },
    // currently has issues when recovering from page swap and then swapping services:
    // `Unexpected token u in JSON at position 0` (internet suggests this is parsing an undefined val)
    // will persist for demo purposes, but we should get this looked at at some point.

    // mixins: [saveData]
})
</script>

<style>
#invoker-app {
    max-width: 1300px;
    overflow-x: scroll;
    margin: 0 auto;
    height: 100%;
}
#invoker-controls {
    display: flex;
    flex-direction: row;
    justify-content: center;
    min-height: 500px;
    max-height: 80vh;
    overflow: scroll;
}
#top {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-width: 300px;
    width: 900px;
    flex-grow: 1;
}
#inputs-container {
    display: flex;
    flex-direction: column;
    min-width: 300px;
    width: 900px;
    flex-grow: 1;
    overflow: scroll;
}
#documentation-container {
    overflow: scroll;
}
#input-output {
    display: flex;
    flex-direction: row;
    justify-content: center;
    max-height: 600px;
}
.error {
    border-style: solid;
    border-color: red;
}
.service-io {
    display: flex;
    flex-direction: column;
    min-width: 300px;
    width: 900px;
    flex-grow: 1;
    padding: 2px;
}
.service-io pre {
    white-space: pre-wrap;
    padding: 2px;
    background-color: black;
    color: white;
    height: 100%;
    min-height: 2em;
    overflow-y: scroll;
}
.selector {
    width: 100%;
    float: left;
    margin: 3px;
}
.selector * {
    float: left;
}
.selector-heading {
    width: 7em;
}
.doc-link {
    text-decoration-line: underline;
    text-decoration-style: dotted;
}
.doc-link::after {
    content: ' (?)';
    vertical-align: super;
    font-size: xx-small;
    line-height: normal;
}
button {
    margin: 3px;
}
#io-title {
    display: block;
    font-size: 1.17em;
    font-weight: bold;
}
#submit-dryrun-button {
    background-color: gray;
}
</style>
