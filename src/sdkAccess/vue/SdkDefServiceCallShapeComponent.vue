/*! * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */

<template>
    <div class="nestedInput">
        <span
            v-if="!listEntry"
            v-bind:class="{ doc_link: doc || schema.documentation, requiredParam: required }"
            v-on:click="
                doc ? showCurrentDoc(doc) : schema.documentation ? showCurrentDoc(schema.documentation) : undefined
            "
        >
            {{ val }}
        </span>
        <!--
            Structure: just pass it down the chain and use this component as an aggregator
        -->
        <div v-if="schema.members">
            <SdkDefServiceCallShapeComponent
                v-for="key in Object.keys(schema.members)"
                :key="key"
                :val="key"
                :schema="service.shapes[schema.members[key].shape]"
                :service="service"
                :required="schema.required && schema.required.includes(key)"
                :doc="schema.members[key].documentation"
                v-bind:listEntry="false"
                @updateRequest="handleUpdateRequest"
                @showDoc="showDoc"
            />
        </div>
        <!--
            Enum: doesn't matter what type, we'll handle them all as strings
        -->
        <div v-else-if="schema.enum">
            <select v-model="data[val]" v-on:change="handleUpdateData">
                <option disabled value="">Select Value...</option>
                <option v-for="e in Object.keys(schema.enum)" :key="e" :value="schema.enum[e]">
                    {{ schema.enum[e] }}
                </option>
            </select>
        </div>
        <!--
            String-likes: Anything we can handle as a string, let's handle as a string. Maybe modify eventually for timestamps
        -->
        <div v-else-if="['string', 'integer', 'timestamp', 'double', 'long'].includes(schema.type)">
            <input type="text" v-model="data[val]" v-on:change="handleUpdateData" />
        </div>
        <!-- Boolean: are checkboxes OK? Probably have inline with some nice padding...will figure out the CSS later -->
        <div v-else-if="schema.type === 'boolean'">
            <input type="checkbox" v-model="data[val]" v-on:change="handleUpdateData" />
        </div>
        <!--
            List: handle with an array that checks for a max size (ignore min for now) and doesn't remove deleted objects
            since it's hard to map items holding their own data to array positions in the parent array
        -->
        <div v-else-if="schema.type === 'list'">
            <div v-for="(item, index) in data[val]" :key="index">
                <div v-if="item !== DELETED_STR">
                    <SdkDefServiceCallShapeComponent
                        :val="index"
                        :schema="service.shapes[schema.member.shape]"
                        :service="service"
                        :required="schema.required && schema.required.includes(key)"
                        :doc="schema.member.shape.documentation"
                        v-bind:listEntry="true"
                        @updateRequest="handleUpdateRequest"
                        @showDoc="showDoc"
                    />
                    <button v-on:click.prevent="deleteElementFromArr(index)">Delete Entry</button>
                </div>
            </div>
            <button v-if="!schema.max || listLength < schema.max" v-on:click.prevent="addToList">
                Add Entry to List
            </button>
        </div>
        <!--
            Blob: handle file inputs (ONLY WORKS ON CLOUD9 FOR NOW!!!) and raw JSON
        -->
        <div v-else-if="schema.type === 'blob'">
            <div>
                <input type="radio" id="file" v-bind:value="true" v-model="useFile" />
                <label for="file">File</label>
                <br />
                <input type="radio" id="text" v-bind:value="false" v-model="useFile" />
                <label for="text">Text</label>
            </div>

            <input v-if="useFile" type="file" @change="processFile($event)" />
            <textarea v-if="!useFile" v-model="data[val]" v-on:change="handleUpdateData"></textarea>
        </div>
        <div v-else-if="schema.type === 'map'">
            PLACEHOLDER MAP
            <input type="checkbox" v-model="data[val]" v-on:change="handleUpdateData" />
        </div>
    </div>
</template>

<script lang="ts">
import { SdkDefDocumentation } from '../sdkDefs'

export default {
    name: 'SdkDefServiceCallShapeComponent',
    props: ['schema', 'val', 'service', 'required', 'doc', 'listEntry'],
    emits: ['updateRequest', 'showDoc'],
    created: function () {
        if (['structure', 'map'].includes(this.schema.type)) {
            this.data[this.val] = {}
        } else if (['string', 'integer', 'timestamp', 'double', 'long'].includes(this.schema.type)) {
            this.data[this.val] = ''
        } else if (this.schema.type === 'boolean') {
            this.data[this.val] = false
        } else if (this.schema.type === 'list') {
            this.data[this.val] = []
        } else if (this.schema.type === 'blob') {
            this.data[this.val] = {
                filename: '',
            }
        }
    },
    data: () =>
        ({
            data: {},
            deletedCount: 0,
            DELETED_STR: '🗑🗑🗑DELETED🗑🗑🗑',
            useFile: true,
        } as any),
    computed: {
        listLength: function () {
            if (this.schema.type === 'list') {
                return this.data[this.val].length - this.deletedCount
            } else {
                return -1
            }
        },
    },
    methods: {
        addToList: function () {
            this.data[this.val].push(undefined)
        },
        showCurrentDoc: function (doc: string) {
            this.showDoc({
                text: doc,
                component: `${this.val} (API Parameter)`,
            })
        },
        showDoc: function (doc: SdkDefDocumentation) {
            this.$emit('showDoc', doc)
        },
        handleUpdateData: function () {
            let data = { ...this.data }
            if (Array.isArray(data[this.val])) {
                data[this.val] = this.filterEliminatedItemsFromArr([...data[this.val]])
            }
            this.$emit('updateRequest', this.val, data)
        },
        handleUpdateRequest: function (key: string, incoming: any) {
            let data = { ...this.data }
            // array: don't modify array in-place so mappings still line up
            if (Array.isArray(data[this.val])) {
                data[this.val][key] = incoming[key]
                data[this.val] = this.filterEliminatedItemsFromArr([...data[this.val]])
            } else {
                data = {
                    ...data,
                    [this.val]: {
                        ...data[this.val],
                        ...incoming,
                    },
                }
                this.data = data
            }
            this.$emit('updateRequest', this.val, data)
        },
        deleteElementFromArr: function (index: number) {
            this.data[this.val][index] = this.DELETED_STR
            this.deletedCount++
            this.handleUpdateData()
        },
        filterEliminatedItemsFromArr: function (arr: any[]) {
            return arr.filter((val: any) => val && val !== this.DELETED_STR)
        },
        processFile: function ($event: Event) {
            const inputFile = $event.target as HTMLInputElement
            if (inputFile.files && inputFile.files.length > 0) {
                console.log(inputFile.files[0])
                this.data[this.val] = {
                    blob: true,
                    // HACK!!!: `.path` only works on Electron!!!
                    //          this will not work in Cloud9!!!!!
                    //          cloud9 can probably use a native c9 file picker.
                    //          maybe do this for VS Code too
                    //          we'll have to kick out to a command from the webview client
                    path: inputFile.files[0].path,
                }
            } else {
                delete this.data[this.val]
            }
            this.handleUpdateData()
        },
    },
}
</script>

<style scoped>
.nestedInput {
    padding-left: 1em;
}
.requiredParam::before {
    content: '* ';
    color: red;
    font-weight: bolder;
}
</style>
