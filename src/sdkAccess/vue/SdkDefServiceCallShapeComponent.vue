/*! * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved. * SPDX-License-Identifier: Apache-2.0 */

<template>
    <div class="nestedInput">
        {{ val }} <span class="requiredParam" v-if="required">*</span>
        <div v-if="schema.members">
            <SdkDefServiceCallShapeComponent
                v-for="key in Object.keys(schema.members)"
                :key="key"
                :val="key"
                :schema="service.shapes[schema.members[key].shape]"
                :service="service"
                :required="schema.required && schema.required.includes(key)"
                @updateRequest="handleUpdateRequest"
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
            <input type="checkbox" v-model="data[val]" v-on:change="handleUpdateData" />
        </div>
        <div v-else-if="schema.type === 'blob'">
            <input type="file" />
        </div>
        <div v-else-if="schema.type === 'map'">
            <input type="checkbox" v-model="data[val]" v-on:change="handleUpdateData" />
        </div>
    </div>
</template>

<script lang="ts">
// import { SdkDefServiceCallShape } from '../sdkDefs'

export default {
    name: 'SdkDefServiceCallShapeComponent',
    props: ['schema', 'val', 'service', 'required'],
    emits: ['updateRequest'],
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
        } as any),
    methods: {
        // changeCurr: function () {
        //     this.$emit('updateRequest', {
        //         str: `changed!x${this.changes}`,
        //         val: this.curr.val,
        //         next: this.curr.next
        //     })
        //     this.changes++
        // },
        handleUpdateData: function () {
            this.$emit('updateRequest', this.val, this.data)
        },
        handleUpdateRequest: function (key: string, incoming: any) {
            console.log(this.val)
            console.log(incoming)
            this.data = {
                ...this.data,
                [this.val]: {
                    ...this.data[this.val],
                    ...incoming,
                },
            }
            this.$emit('updateRequest', this.val, this.data)
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
