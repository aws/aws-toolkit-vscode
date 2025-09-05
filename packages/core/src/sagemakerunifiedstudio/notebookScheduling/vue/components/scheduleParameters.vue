<script setup lang="ts">
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { reactive } from 'vue'
import TkSpaceBetween from '../../../shared/ux/tkSpaceBetween.vue'
import KeyValueParameter from './keyValueParameter.vue'

//-------------------------------------------------------------------------------------------------
// State
//-------------------------------------------------------------------------------------------------
interface ParameterValue {
    name: string
    value: string
}

interface State {
    count: number
    parameters: number[]
    parameterValues: Map<number, ParameterValue>
}

const state: State = reactive({
    count: 0,
    parameters: [],
    parameterValues: new Map(),
})

//-------------------------------------------------------------------------------------------------
// Variables & Methods
//-------------------------------------------------------------------------------------------------
function onAdd(): void {
    state.count += 1
    state.parameters.push(state.count)
}

function onRemove(id: number): void {
    state.parameters = state.parameters.filter((parameterId) => parameterId !== id)
    state.parameterValues.delete(id)
}

function onParameterChange(id: number, error: boolean, name: string, value: string): void {
    if (error) {
        state.parameterValues.delete(id)
    } else {
        state.parameterValues.set(id, { name, value })
    }
}
</script>

<template>
    <div class="schedule-parameters">
        <tk-space-between>
            <tk-space-between v-if="state.parameters.length > 0">
                <key-value-parameter
                    v-for="parameter in state.parameters"
                    :key="parameter"
                    :id="parameter"
                    @change="onParameterChange"
                    @remove="onRemove"
                />
            </tk-space-between>
            <div>
                <button class="schedule-parameters-add-button" @click="onAdd">+</button>
            </div>
        </tk-space-between>
    </div>
</template>

<style scoped>
.schedule-parameters-add-button {
    background: none;
    border: none;
    color: var(--vscode-button-background);
    cursor: pointer;
    font-size: 18px;
    padding: 2px 4px;
}

.schedule-parameters-add-button:focus {
    outline: none;
}
</style>
