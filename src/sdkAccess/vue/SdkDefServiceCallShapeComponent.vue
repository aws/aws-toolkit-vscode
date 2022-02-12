/*! * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */

<template>
    <div
        class="nested-input"
        v-bind:class="{
            'flex-input': !listEntry && !['structure', 'list', 'map'].includes(schema.type),
        }"
    >
        <div class="nested-input-title">
            <span
                v-if="!listEntry"
                v-bind:class="{ 'doc-link': doc || schema.documentation, 'required-param': required }"
                v-on:click="
                    doc ? showCurrentDoc(doc) : schema.documentation ? showCurrentDoc(schema.documentation) : undefined
                "
            >
                {{ val }}
            </span>
            <template v-if="['list', 'map'].includes(schema.type)">
                <button class="add-button" v-if="!schema.max || listLength < schema.max" v-on:click.prevent="addToList">
                    + Add to {{ schema.type }}
                </button>
            </template>
        </div>
        <!--
            Structure: just pass it down the chain and use this component as an aggregator
        -->
        <template v-if="schema.members">
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
        </template>
        <!--
            Enum: doesn't matter what type, we'll handle them all as strings
        -->
        <template v-else-if="schema.enum">
            <select v-model="data[val]" v-on:change="handleUpdateData">
                <option disabled selected hidden>Select Value...</option>
                <option v-bind:value="undefined">(unset value)</option>
                <option v-for="e in Object.keys(schema.enum)" :key="e" :value="schema.enum[e]">
                    {{ schema.enum[e] }}
                </option>
            </select>
        </template>
        <!--
            String-likes: Anything we can handle as a string, let's handle as a string. Maybe modify eventually for timestamps
        -->
        <template v-else-if="['string', 'integer', 'timestamp', 'double', 'long'].includes(schema.type)">
            <input type="text" v-model="data[val]" v-on:change="handleUpdateData" />
        </template>
        <!-- Boolean: are checkboxes OK? Probably have inline with some nice padding...will figure out the CSS later -->
        <template v-else-if="schema.type === 'boolean'">
            <input type="checkbox" v-model="data[val]" v-on:change="handleUpdateData" />
        </template>
        <!--
            List: handle with an array that checks for a max size (ignore min for now) and doesn't remove deleted objects
            since it's hard to map items holding their own data to array positions in the parent array
        -->
        <template v-else-if="schema.type === 'list'">
            <div class="list-container">
                <template v-for="(item, index) in data[val]" :key="index">
                    <div v-if="item !== DELETED_STR" class="list-entry">
                        <button class="delete-button" v-on:click.prevent="deleteElementFromArr(index)">x</button>
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
                    </div>
                </template>
            </div>
        </template>
        <!--
            Blob: handle file inputs (ONLY WORKS ON CLOUD9 FOR NOW!!!) and raw JSON
        -->
        <template v-else-if="schema.type === 'blob'">
            <div>
                <input type="radio" id="file" v-bind:value="true" v-model="useFile" v-on:change="handleUpdateData" />
                <label for="file">File</label>
                <br />
                <input type="radio" id="text" v-bind:value="false" v-model="useFile" v-on:change="handleUpdateData" />
                <label for="text">Text</label>
            </div>

            <input v-if="useFile" type="file" @change="processFile" />
            <textarea v-if="!useFile" v-model="data[val].text" v-on:change="handleUpdateData"></textarea>
        </template>
        <!--
            Map: handle like a list. Same tradeoffs, store in an array and process the array before pushing up.
        -->
        <template v-else-if="schema.type === 'map'">
            <template v-for="(item, index) in data[val]" :key="index">
                <div class="map-entry" v-if="item !== DELETED_STR">
                    <button class="delete-button" v-on:click.prevent="deleteElementFromArr(index)">x</button>
                    <div class="map-cell">
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
                    </div>
                    <div class="map-cell">
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
                    </div>
                </div>
            </template>
        </template>
    </div>
</template>

<script lang="ts">
import { SdkDefDocumentation } from '../sdkDefs'

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
                files: {},
                text: '',
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
            this.showDoc({
                text: doc,
                component: `${this.val} (API Parameter - ${this.schema.type})`,
            })
        },
        /**
         * Bubbles doc requests up from child components
         */
        showDoc: function (doc: SdkDefDocumentation) {
            this.$emit('showDoc', doc)
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
            if (Array.isArray(this.data[this.val])) {
                data[this.val] = this.handleArrayOperations([...data[this.val]])
            } else if (this.schema.type === 'blob') {
                if (this.useFile) {
                    if (data[this.val].path) {
                        data = { [this.val]: { blob: true, path: data[this.val].path } }
                    }
                } else {
                    this.data[this.val].path = undefined
                    data = { [this.val]: this.data[this.val].text !== '' ? this.data[this.val].text : undefined }
                }
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
                    ...this.data[this.val],
                    // HACK!!!: `.path` only works on Electron!!!
                    //          this will not work in Cloud9!!!!!
                    //          cloud9 can probably use a native c9 file picker.
                    //          maybe do this for VS Code too
                    //          we'll have to kick out to a command from the webview client
                    path: inputFile.files[0].path,
                }
            } else {
                delete this.data[this.val].path
            }
            this.handleUpdateData()
        },
    },
}
</script>

<style scoped>
.nested-input {
    padding-left: 1em;
    margin: 3px;
    display: flex;
    flex-direction: column;
}
.nested-input * {
    margin-left: 3px;
}
.nested-input input[type='text'] {
    flex: 1;
}
.nested-input-title {
    width: 14em;
}
.flex-input {
    display: flex;
    flex-direction: row;
}
.flex-input * {
    margin-left: 3px;
}
.list-entry,
.map-entry {
    display: flex;
    flex: 0 0 auto;
}
.map-cell {
    flex: 1;
}
.required-param::before {
    content: '* ';
    color: red;
    font-weight: bolder;
}
.delete-button,
.add-button {
    width: max-content;
    padding: 1px 6px;
}
.add-button {
    margin-left: 1em;
}
</style>
