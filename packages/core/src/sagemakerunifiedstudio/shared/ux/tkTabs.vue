<script setup lang="ts">
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TkTabs Component
 *
 * A reusable tabs component that displays multiple content panels with clickable tab headers.
 * Only one tab content is visible at a time, with the active tab highlighted in the header.
 * This component manages its own internal state for tracking the active tab.
 *
 * ### Props
 * @prop {Tab[]} tabs - Array of tab objects, each containing a label, id, and Vue component for content.
 *
 * ### Tab Interface
 * @interface Tab
 * @prop {string} label - The display text shown in the tab header.
 * @prop {string} id - Unique identifier for the tab.
 * @prop {Component} content - Vue component to render when this tab is active.
 *
 * ### Example Usage
 * ```vue
 * <tk-tabs :tabs="[
 *   { label: 'Overview', id: 'overview', content: OverviewComponent },
 *   { label: 'Settings', id: 'settings', content: SettingsComponent },
 *   { label: 'Advanced', id: 'advanced', content: AdvancedComponent }
 * ]" />
 * ```
 */

import { Component, computed } from 'vue'
import { reactive } from 'vue'

//-------------------------------------------------------------------------------------------------
// Props
//-------------------------------------------------------------------------------------------------
export interface Tab {
    label: string
    id: string
    content: Component
}

interface Props {
    tabs: Tab[]
    selectedTab?: number
}

const props = withDefaults(defineProps<Props>(), { selectedTab: undefined })

//-------------------------------------------------------------------------------------------------
// State
//-------------------------------------------------------------------------------------------------
interface State {
    activeTab: number
    tabClicked: boolean
}

const state: State = reactive({
    activeTab: 0,
    tabClicked: false,
})

//-------------------------------------------------------------------------------------------------
// Computed Properties
//-------------------------------------------------------------------------------------------------
const activeTab = computed(() => {
    if (state.tabClicked) {
        return state.activeTab
    } else if (props.selectedTab && props.selectedTab < props.tabs.length) {
        return props.selectedTab
    } else {
        return state.activeTab
    }
})

//-------------------------------------------------------------------------------------------------
// Variables & Methods
//-------------------------------------------------------------------------------------------------
function onTabClick(index: number): void {
    state.tabClicked = true
    state.activeTab = index
}
</script>

<template>
    <div class="tk-tabs">
        <div class="tk-tabs-header">
            <ul class="tk-tabs-header-tablist">
                <li v-for="(tab, index) in props.tabs" :key="index">
                    <div
                        class="tk-tabs-header-tablist-item"
                        :class="{ 'tk-tabs-header-tablist-item_active': index === activeTab }"
                    >
                        <button @click="onTabClick(index)">{{ tab.label }}</button>
                    </div>
                </li>
            </ul>
        </div>
        <div class="tk-tabs-content">
            <template v-for="(tab, index) in props.tabs" :key="index">
                <div class="tk-tabs-content-item" :class="{ 'tk-tabs-content-item_active': index === activeTab }">
                    <component :is="tab.content"></component>
                </div>
            </template>
        </div>
    </div>
</template>

<style scoped>
.tk-tabs-header {
    position: relative;
}

.tk-tabs-header-tablist {
    display: flex;
    list-style: none;
    margin: 0;
    padding: 0;
}

.tk-tabs-header-tablist::before {
    bottom: 0;
    background-color: var(--vscode-settings-headerBorder);
    content: '';
    height: 1px;
    left: 0;
    position: absolute;
    width: 100%;
}

.tk-tabs-header-tablist > li {
    position: relative;
}

.tk-tabs-header-tablist-item::after {
    bottom: 0;
    background-color: var(--vscode-settings-headerForeground);
    content: '';
    height: 0;
    left: 0;
    position: absolute;
    width: 100%;
}

.tk-tabs-header-tablist-item > button {
    background: none;
    border: none;
    color: var(--vscode-foreground);
    font-size: var(--tk-font-size-medium);
    padding: 8px 12px;
}

.tk-tabs-header-tablist-item.tk-tabs-header-tablist-item_active::after {
    height: 1px;
}

.tk-tabs-header-tablist-item.tk-tabs-header-tablist-item_active > button {
    color: var(--vscode-settings-headerForeground);
}

.tk-tabs-content-item {
    display: none;
    padding-top: var(--tk-gap-medium);
}

.tk-tabs-content-item.tk-tabs-content-item_active {
    display: block;
}
</style>
