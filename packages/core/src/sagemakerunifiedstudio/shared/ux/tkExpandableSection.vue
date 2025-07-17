<script setup lang="ts">
/**
 * TkExpandableSection Component
 *
 * A collapsible/expandable section component with a clickable header and animated content area.
 * Displays right/down arrow icons to indicate collapsed/expanded state.
 *
 * ### Props
 * @prop {string} header - The header text displayed at the top of the section. Clicking this toggles expansion.
 *
 * ### Slots
 * @slot default - Content to display inside the expandable area.
 *
 * ### Example Usage
 * ```vue
 * <tk-expandable-section header="Advanced Settings">
 *   <p>This section contains advanced configuration options.</p>
 * </tk-expandable-section>
 * ```
 */

import { reactive } from 'vue'

interface Props {
    header: string
}

const props = withDefaults(defineProps<Props>(), {})

interface State {
    expanded: boolean
}

const state: State = reactive({
    expanded: false,
})

const onExpandClicked = () => {
    state.expanded = !state.expanded
}
</script>

<template>
    <div class="expandable-section" :class="state.expanded ? 'expanded' : ''">
        <div class="expandable-section-header" @click="onExpandClicked">
            <span class="expandable-section-icon-right" :class="state.expanded ? '' : 'show'">&#9658;</span>
            <span class="expandable-section-icon-down" :class="state.expanded ? 'show' : ''">&#9660;</span>
            <span>{{ props.header }}</span>
        </div>
        <div class="expandable-section-content" :class="state.expanded ? 'show' : ''">
            <slot />
        </div>
    </div>
</template>

<style scoped>
.expandable-section {
    border: 1px solid var(--vscode-settings-textInputBorder);
    padding: 5px;
}

.expandable-section-header {
    align-items: center;
    column-gap: 5px;
    cursor: pointer;
    display: flex;
    height: 18px;
    margin: 5px;
    user-select: none;
}

.expandable-section-icon-right {
    color: var(--vscode-button-background);
    display: none;
    font-size: 12px;
    height: 12px;
    width: 12px;
}

.expandable-section-icon-down {
    color: var(--vscode-button-background);
    display: none;
    font-size: 15px;
    height: 18px;
    width: 12px;
}

.expandable-section-icon-right.show,
.expandable-section-icon-down.show {
    display: block;
}

.expandable-section-content {
    display: none;
    margin: 10px;
}

.expandable-section-content.show {
    display: block;
}
</style>
