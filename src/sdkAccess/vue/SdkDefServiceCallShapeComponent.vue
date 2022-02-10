/*! * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */

<template>
    <div class="nestedInput">
        <span
            v-if="!listEntry"
            v-bind:class="doc || schema.documentation ? 'doc_link' : ''"
            v-on:click="
                doc ? showCurrentDoc(doc) : schema.documentation ? showCurrentDoc(schema.documentation) : undefined
            "
        >
            {{ val }}
        </span>
        <span class="requiredParam" v-if="required">*</span>
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
        <div v-else-if="schema.enum">
            <select v-model="data[val]" v-on:change="handleUpdateData">
                <option disabled value="">Select Value...</option>
                <option v-for="e in Object.keys(schema.enum)" :key="e" :value="schema.enum[e]">
                    {{ schema.enum[e] }}
                </option>
            </select>
        </div>
        <div v-else-if="['string', 'integer', 'timestamp', 'double', 'long'].includes(schema.type)">
            <input type="text" v-model="data[val]" v-on:change="handleUpdateData" />
        </div>
        <div v-else-if="schema.type === 'boolean'">
            <input type="checkbox" v-model="data[val]" v-on:change="handleUpdateData" />
        </div>
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
                    <button v-on:click.prevent="deleteElement(index)">Delete Entry</button>
                </div>
            </div>
            <button v-if="!schema.max || listLength < schema.max" v-on:click.prevent="addToList">
                Add Entry to List
            </button>
        </div>
        <div v-else-if="schema.type === 'blob'">
            PLACEHOLDER BLOB
            <input type="file" />
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
        deleteElement: function (index: number) {
            this.data[this.val][index] = this.DELETED_STR
            this.deletedCount++
            this.handleUpdateData()
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
                data[this.val] = this.filterEliminatedItemsFromArray([...data[this.val]])
            }
            this.$emit('updateRequest', this.val, data)
        },
        handleUpdateRequest: function (key: string, incoming: any) {
            let data = { ...this.data }
            // array: don't modify array in-place so mappings still line up
            if (Array.isArray(data[this.val])) {
                data[this.val][key] = incoming[key]
                data[this.val] = this.filterEliminatedItemsFromArray([...data[this.val]])
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
        filterEliminatedItemsFromArray: function (arr: any[]) {
            return arr.filter((val: any) => val && val !== this.DELETED_STR)
        },
    },
}
</script>

<style scoped>
.nestedInput {
    padding-left: 1em;
}
.requiredParam {
    color: red;
    font-weight: bolder;
}
</style>
