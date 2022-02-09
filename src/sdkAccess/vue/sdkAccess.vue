/*! * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */
<template>
    <h1>AWS SDK Invoker</h1>
    <div id="top">
        <div id="selectors">
            <select v-model="currRegion">
                <option disabled value="">Select AWS Region...</option>
                <option v-for="region in initialData.regions" :key="region.id" :value="region.id">
                    {{ region.name }}
                </option>
            </select>
            <br />
            <select v-model="currService" v-on:change="getService">
                <option disabled value="">Select AWS Service...</option>
                <option v-for="service in initialData.services" :key="service" :value="service">
                    {{ service }}
                </option>
            </select>
            <br />
            <select
                v-model="currApi"
                v-if="currServiceDefinition && currServiceDefinition.operations"
                v-on:change="selectApi"
            >
                <option disabled value="">Select AWS Service API...</option>
                <option v-for="api in Object.keys(currServiceDefinition.operations)" :key="api" :value="api">
                    {{ api }}
                </option>
            </select>
        </div>
        <div id="serviceDescription" v-html="currDocumentation"></div>
    </div>
    <form id="inputs" v-if="currApiDefinition">
        <pre>{{ request }}</pre>
        <SdkDefServiceCallShapeComponent
            :key="currApiDefinition.input.shape"
            :val="currApiDefinition.input.shape"
            :schema="currServiceDefinition.shapes[currApiDefinition.input.shape]"
            :service="currServiceDefinition"
            @updateRequest="handleUpdateRequest"
        />
        <button v-on:click.prevent="submitRequest">Call {{ currService }}.{{ currApi }}</button>
    </form>
    <pre v-if="response" v-bind:class="{ error: isResponseErr }">{{ response }}</pre>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../webviews/client'
import { InitialData, SdkAccessWebview } from '../sdkAccessBackend'
import { SdkDefService, SdkDefServiceCall } from '../sdkDefs'
import SdkDefServiceCallShapeComponent from './SdkDefServiceCallShapeComponent.vue'

interface DataShape {
    initialData: InitialData
    currService: string
    currRegion: string
    currApi: string
    currServiceDefinition: SdkDefService | undefined
    currApiDefinition: SdkDefServiceCall | undefined
    currDocumentation: string
    request: any
    response: any
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
        currDocumentation: '',
        request: {},
        response: undefined,
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
            console.log('calling!!!')
            client.makeSdkCall({ service: this.currService, region: this.currRegion, api: this.currApi }, this.request)
        },
        selectApi: function () {
            this.currDocumentation =
                this.currServiceDefinition?.operations[this.currApi].documentation ?? this.currDocumentation
            this.currApiDefinition = this.currServiceDefinition?.operations[this.currApi]
            this.request = {}
        },
        handleUpdateRequest: function (key: string, incoming: any) {
            this.request = incoming[this.currApiDefinition!.input.shape]
        },
        onLoadedServiceDefinition: function (service: SdkDefService) {
            this.currServiceDefinition = service
            this.currDocumentation = service.documentation
        },
        onSDKResponse: function (response: any) {
            if (response.ERROR) {
                this.isResponseErr = true
                this.response = response.ERROR
            } else {
                this.isResponseErr = false
                this.response = response
            }
        },
    },

    mixins: [],
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
.temp {
    height: 20px;
    width: 20px;
    background-color: red;
    margin: 1em;
}
.error {
    border-style: solid;
    color: red;
}
</style>
