<template>
    <div :id="id" class="settings-panel">
        <div class="header">
            <input
                ref="button"
                v-bind:id="buttonId"
                class="preload-transition collapse-button"
                type="checkbox"
                v-if="collapseable || startCollapsed"
                v-model="collapsed"
            />
            <label v-bind:for="buttonId">
                <p class="settings-title">{{ title }}</p>
                <p class="soft no-spacing">{{ description }}</p>
            </label>
        </div>
        <transition
            @enter="updateHeight"
            @beforeLeave="updateHeight"
            :name="collapseable || startCollapsed ? 'collapse' : ''"
        >
            <div ref="subPane" v-show="!collapsed" class="sub-pane">
                <slot></slot>
            </div>
        </transition>
    </div>
</template>

<script lang="ts">
import { WebviewApi } from 'vscode-webview'
import { defineComponent } from 'vue'

declare const vscode: WebviewApi<{ [key: string]: VueModel }>

let count = 0

interface VueModel {
    collapsed: boolean
    buttonId: string
    subPane?: HTMLElement
    lastHeight?: number
}

/**
 * Settings panel is header + body, which may be collapseable
 */
export default defineComponent({
    name: 'settings-panel',
    props: {
        id: String,
        startCollapsed: Boolean,
        collapseable: Boolean,
        title: String,
        description: String,
    },
    data() {
        count += 1
        return {
            collapsed: this.$props.startCollapsed ?? false,
            buttonId: `settings-panel-button-${count}`,
        } as VueModel
    },
    methods: {
        updateState() {
            if (this.id === undefined || this.id === '') {
                return
            }

            vscode.setState(
                Object.assign(vscode.getState() ?? {}, {
                    [this.id]: {
                        collapsed: this.collapsed,
                        lastHeight: this.lastHeight,
                    },
                })
            )
        },
        updateHeight(el: Element & { style: CSSStyleDeclaration }) {
            this.lastHeight = el.scrollHeight
            this.updateState()
            el.style.setProperty('--max-height', `${this.lastHeight}px`)
        },
    },
    created() {
        if (this.id === undefined || this.id === '') {
            return
        }

        const lastState: Partial<VueModel> = (vscode.getState() ?? {})[this.id]

        // TODO: make recurse
        Object.keys(lastState ?? {}).forEach(key => {
            this.$data[key] = lastState[key] ?? this.$data[key]
        })
    },
    mounted() {
        this.subPane = this.$refs.subPane as HTMLElement | undefined
        this.lastHeight = this.collapsed ? this.lastHeight : this.subPane?.scrollHeight ?? this.lastHeight

        // TODO: write preload as a directive or global
        ;(this.$refs.button as HTMLElement | undefined)?.classList.remove('preload-transition')
    },
})
</script>

<style scoped>
.preload-transition {
    transition: none !important;
}
.settings-title {
    font-size: calc(1.1 * var(--vscode-font-size)); /* TODO: make this configurable */
    font-weight: bold;
    margin: 0 0 2px 0;
    padding: 0;
}
.sub-pane {
    transition: max-height 0.5s, padding 0.5s;
    padding: 1rem;
    overflow: hidden;
}
.sub-pane .button-container:first-child {
    margin-top: 0;
}
.collapse-leave-from {
    max-height: var(--max-height);
}
.collapse-leave-active {
    transition: max-height 0.5s, visibility 0.5s, padding 0.5s;
    visibility: hidden;
    padding: 0 1rem;
    max-height: 0;
}
.collapse-enter-active {
    transition: max-height 0.5s, padding 0.5s;
    max-height: 0;
    padding: 0 1rem;
}
.collapse-enter-to {
    max-height: var(--max-height);
    padding: 1rem;
}
.collapse-button {
    width: 24px;
    height: 24px;
    -webkit-appearance: none;
    display: inline;
    margin: -4px 12px 0 0;
    padding: 0;
    background: transparent;
    background-size: 24px;
    background-repeat: no-repeat;
    background-position: center;
    opacity: 0.8;
    transition: transform 0.5s;
}
body.vscode-dark .collapse-button {
    background-image: url('/resources/dark/expand-less.svg');
}
body.vscode-light .collapse-button {
    background-image: url('/resources/light/expand-less.svg');
}
.collapse-button:checked {
    transform: rotate(180deg);
}
.settings-panel {
    background: var(--vscode-menu-background);
    margin: 16px 0;
}
</style>
