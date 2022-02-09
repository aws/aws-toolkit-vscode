/*! * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */
<template>
    <h1>AWS SDK Invoker</h1>
    <div id="top">
        <div id="selectors" float="left">
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
        <div id="serviceDescription" float="right" v-html="currDocumentation"></div>
    </div>
    <div id="inputs"></div>
    <pre v-if="currApi && currServiceDefinition">{{ currServiceDefinition.operations[currApi] }}</pre>
    <pre v-if="response">{{ response }}</pre>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { WebviewClientFactory } from '../../webviews/client'
import { InitialData, SdkAccessWebview } from '../sdkAccessBackend'
import { SdkDefService, SdkDefServiceCall } from '../sdkDefs'

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
}

const defaultInitialData: InitialData = {
    services: [],
    regions: [],
    profile: '',
}

const client = WebviewClientFactory.create<SdkAccessWebview>()
export default defineComponent({
    data: (): DataShape => ({
        initialData: defaultInitialData,
        currService: '',
        currRegion: '',
        currApi: '',
        currServiceDefinition: undefined,
        currApiDefinition: undefined,
        currDocumentation: '',
        request: {},
        response: {},
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
            client.getServiceDefinition(this.currService)
        },
        submitRequest: function () {
            client.makeSdkCall({ service: this.currService, region: this.currRegion, api: this.currApi }, this.request)
        },
        selectApi: function () {
            this.currDocumentation =
                this.currServiceDefinition?.operations[this.currApi].documentation ?? this.currDocumentation
        },
        onLoadedServiceDefinition: function (service: SdkDefService) {
            this.currServiceDefinition = service
            this.currDocumentation = service.documentation
        },
        onSDKResponse: function (response: any) {
            // dump response onto page
            // can we determine errors? if so, give them a tasteful color
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
    width: 50%;
    overflow: hidden;
    float: left;
    /* padding: 1em; */
}
</style>
