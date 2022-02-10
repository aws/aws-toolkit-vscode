/*! * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */
<template>
    <h1>AWS SDK Invoker</h1>
    <div id="top">
        <div id="selectors">
            <div class="selector">
                <div class="selector_heading">AWS Region</div>
                <select v-model="currRegion">
                    <option disabled value="">Select AWS Region...</option>
                    <option v-for="region in initialData.regions" :key="region.id" :value="region.id">
                        {{ region.name }}
                    </option>
                </select>
            </div>
            <div class="selector">
                <div class="selector_heading">
                    <span
                        v-bind:class="{ doc_link: currServiceDefinition && currServiceDefinition.documentation }"
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
                    <option disabled value="">Select AWS Service...</option>
                    <option v-for="service in initialData.services" :key="service" :value="service">
                        {{ service }}
                    </option>
                </select>
            </div>
            <div class="selector">
                <div class="selector_heading">
                    <span
                        v-bind:class="{
                            doc_link:
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
                    <option disabled value="">Select a Service First...</option>
                    <option v-for="api in Object.keys(currServiceDefinition.operations)" :key="api" :value="api">
                        {{ api }}
                    </option>
                </select>
                <select v-else>
                    <option disabled value="">Select AWS Service API...</option>
                </select>
            </div>
        </div>
        <div v-if="currDocumentation" id="description">
            <h2>Documentation: {{ currDocumentation.component }}</h2>
            <div id="serviceDescription" v-html="currDocumentation.text"></div>
        </div>
    </div>
    <form id="inputs" v-if="currApiDefinition">
        <SdkDefServiceCallShapeComponent
            :key="currApiDefinition.input.shape"
            :val="currApiDefinition.input.shape"
            :schema="currServiceDefinition.shapes[currApiDefinition.input.shape]"
            :service="currServiceDefinition"
            @updateRequest="handleUpdateRequest"
            @showDoc="showArbitraryDocumentation"
        />
        <button v-on:click.prevent="submitRequest">Call {{ currService }}.{{ currApi }}</button>
    </form>
    <div v-if="last" id="inputoutput">
        <h3>Most Recent Request ({{ `${last.service}.${last.api}` }})</h3>
        <div class="service_io">
            <p>Request</p>
            <pre v-if="last.request">{{ last.request }}</pre>
        </div>
        <div class="service_io">
            <p>Response</p>
            <pre v-if="response" v-bind:class="{ error: isResponseErr }">{{ response }}</pre>
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
}

const defaultInitialData: InitialData = {
    services: [],
    regions: [],
    profile: '',
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
    }),
    async created() {
        this.initialData = (await client.init()) ?? this.initialData
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
        submitRequest: function () {
            this.last = {
                service: this.currService,
                api: this.currApi,
                request: this.request,
            }
            this.isResponseErr = false
            this.response = '...waiting for response...'
            client.makeSdkCall({ service: this.currService, region: this.currRegion, api: this.currApi }, this.request)
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
            if (response.ERROR) {
                this.isResponseErr = true
                this.response = response.ERROR
            } else {
                this.response = response
            }
        },
    },
})
</script>
<style>
#top {
    overflow: hidden;
}
#top div {
    overflow: hidden;
    float: left;
    /* padding: 1em; */
}
#selectors {
    width: 20%;
}
#serviceDescription {
    width: 70%;
}
.error {
    border-style: solid;
    border-color: red;
}
.service_io {
    float: left;
    width: 40%;
}
.service_io pre {
    white-space: pre-wrap;
    padding: 2px;
    background-color: black;
    color: white;
}
.selector {
    width: 100%;
    float: left;
    margin: 3px;
}
.selector * {
    float: left;
}
.selector_heading {
    width: 7em;
}
.doc_link {
    text-decoration-line: underline;
    text-decoration-style: dotted;
}
.doc_link::after {
    content: ' (?)';
    vertical-align: super;
    font-size: xx-small;
    line-height: normal;
}
button {
    margin: 3px;
}
</style>
