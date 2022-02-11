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
                <option disabled selected hidden>Select Value...</option>
                <option v-bind:value="undefined">(unset value)</option>
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
        <!--
            Map: handle like a list. Same tradeoffs, store in an array and process the array before pushing up.
        -->
        <div v-else-if="schema.type === 'map'">
            <div v-for="(item, index) in data[val]" :key="index">
                <div v-if="item !== DELETED_STR">
                    Key:
                    <SdkDefServiceCallShapeComponent
                        :val="`${index}:key`"
                        :schema="service.shapes[schema.key.shape]"
                        :service="service"
                        :required="schema.required && schema.required.includes(key)"
                        :doc="service.shapes[schema.key.shape]"
                        v-bind:listEntry="true"
                        @updateRequest="handleUpdateRequest"
                        @showDoc="showDoc"
                    />
                    Value:
                    <SdkDefServiceCallShapeComponent
                        :val="`${index}:value`"
                        :schema="service.shapes[schema.value.shape]"
                        :service="service"
                        :required="schema.required && schema.required.includes(key)"
                        :doc="service.shapes[schema.value.shape]"
                        v-bind:listEntry="true"
                        @updateRequest="handleUpdateRequest"
                        @showDoc="showDoc"
                    />
                    <button v-on:click.prevent="deleteElementFromArr(index)">Delete Entry</button>
                </div>
            </div>
            <button v-if="!schema.max || listLength < schema.max" v-on:click.prevent="addToList">
                Add Entry to Map
            </button>
        </div>
    </div>
</template>

<script lang="ts">
export default {
    name: 'SdkDefServiceCallShapeComponent',
    props: ['schema', 'val', 'service', 'required', 'doc', 'listEntry'],
    emits: ['updateRequest', 'showDoc'],
    created: function () {
        if (['list', 'map'].includes(this.schema.type)) {
            this.data[this.val] = []
        } else if (['string', 'integer', 'timestamp', 'double', 'long'].includes(this.schema.type)) {
            this.data[this.val] = ''
        } else if (this.schema.type === 'boolean') {
            this.data[this.val] = false
        } else if (this.schema.type === 'structure') {
            this.data[this.val] = {}
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
            if (['list', 'map'].includes(this.schema.type)) {
                return this.data[this.val].length - this.deletedCount
            } else {
                return -1
            }
        },
    },
    methods: {
        /**
         * Pushes a new object into the array.
         * Array only grows (and index grows with it). True array state is only known to this component.
         */
        addToList: function () {
            this.data[this.val].push(undefined)
        },
        /**
         * Bubbles documentation information up stack, if present
         */
        showCurrentDoc: function (doc: string) {
            this.$emit('showDoc', {
                text: doc,
                component: `${this.val} (API Parameter)`,
            })
        },
        /**
         * Handles edits to own data.
         * Updates existing strings/booleans, and handles array deletion events
         * Doesn't do anything for structs as they don't have "own" data but have to hold onto child state
         * Bubbles the state up the chain to the parent request
         */
        handleUpdateData: function () {
            if (this.data[this.val] === undefined) {
                delete this.data[this.val]
            }
            let data = { ...this.data }
            // handles deletions
            if (Array.isArray(data[this.val])) {
                data[this.val] = this.handleArrayOperations([...data[this.val]])
            }
            this.$emit('updateRequest', this.val, data)
        },
        /**
         * Handles incoming data and bubbles the transformed data upwards.
         * Should only be called on structs and arrays: child items will never call this on self.
         * Structs: spread copy, alter the state, and re-write: these need to know the state of children
         * Arrays: Convert to a squashed array (no undefined or deletions) and DON'T save: array state needs to be consistent
         * Maps: Convert to a squashed array as above, reduces to an object of arbitrary keys/values, and also doesn't save arr state
         */
        handleUpdateRequest: function (key: string, incoming: any) {
            let data = { ...this.data }
            // array: don't modify array in-place so mappings still line up
            if (Array.isArray(data[this.val])) {
                if (this.schema.type === 'list') {
                    data[this.val][key] = incoming[key]
                } else {
                    const parsedKey = key.split(':')
                    data[this.val][parsedKey[0]] = {
                        ...(data[this.val][parsedKey[0]] ?? {}),
                        [parsedKey[1]]: incoming[key],
                    }
                }
                data[this.val] = this.handleArrayOperations([...data[this.val]])
                // non arrays: spread and insert the new state and resave to data
            } else {
                if (Object.keys(incoming).length > 0) {
                    data = {
                        ...data,
                        [this.val]: {
                            ...data[this.val],
                            ...incoming,
                        },
                    }
                } else {
                    delete data[this.val][key]
                }
                this.data = data
            }
            this.$emit('updateRequest', this.val, data)
        },
        /**
         * Changes index to "DELETED" value.
         * Does not mmodify the length of the array since we only know the state of children that's reported back:
         * Modifying the array runs the risk of making data in the children inconsistent with the array
         * We will squash out deleted items in this.handleArrayOperations
         */
        deleteElementFromArr: function (index: number) {
            this.data[this.val][index] = this.DELETED_STR
            this.deletedCount++
            this.handleUpdateData()
        },
        /**
         * Does the following:
         * Deletes DELETED values
         * For `map` types: reduces array to a key:value pair
         * NOTE: not smart enough to dedupe pair names. Will overwrite any double keys.
         */
        handleArrayOperations: function (arr: any[]) {
            let data = arr.filter((val: any) => val && val !== this.DELETED_STR)
            console.log(data)
            if (this.schema.type === 'map') {
                data = data.reduce((acc: any, curr: any) => {
                    return {
                        ...acc,
                        [curr.key]: curr.value ?? undefined,
                    }
                }, {})
            }

            return data
        },
        /**
         * Pulls the filename from file selection, using a local path
         * WILL NOT WORK IN CLOUD9 AS-IS!!!
         */
        processFile: function ($event: Event) {
            const inputFile = $event.target as HTMLInputElement
            if (inputFile.files && inputFile.files.length > 0) {
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
