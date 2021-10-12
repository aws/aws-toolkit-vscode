<template>
    <div class="button-container">
        <input
            class="radio"
            type="radio"
            name="roleMode"
            id="create-iam-role"
            v-model="modelValue.roleMode"
            value="new-role"
            @input="update('roleMode', $event.target.value)"
        />
        <div class="config-item" :data-disabled="modelValue.roleMode === 'select-role'">
            <label class="option-label" for="create-iam-role">
                <div class="mb-2">AWSCloud9EnvironmentRole</div>
                <span class="soft">
                    If this role doesn't already exist, we will create a new role in your account and use it for your
                    Cloud9 environment. This role will have the Developer user policy.
                </span>
            </label>
            <input :disabled="modelValue.roleMode === 'select-role'" type="hidden" id="create-iam-role" />
        </div>
    </div>

    <div class="button-container">
        <input
            class="radio"
            type="radio"
            name="roleMode"
            id="select-iam-role"
            v-model="modelValue.roleMode"
            value="select-role"
            @input="update('roleMode', $event.target.value)"
        />
        <div class="config-item" :data-disabled="modelValue.roleMode === 'new-role'">
            <label class="option-label" for="select-iam-role" style="padding: 0 0 2px 0">
                <div class="mb-2">Existing role</div>
            </label>
            <select
                name="role-selector"
                id="select-iam-role"
                v-model="modelValue.selectedRoleName"
                :disabled="modelValue.roleMode === 'new-role'"
                required
                @input="update('selectedRoleName', $event.target.value)"
            >
                <option disabled selected value="">Choose a role...</option>
                <option v-for="(role, index) in modelValue.roles" v-bind:value="role.RoleName" :key="index">
                    {{ role.RoleName }}
                </option>
            </select>
        </div>
    </div>
</template>

<script lang="ts">
import { IAM } from 'aws-sdk'
import { WebviewApi } from 'vscode-webview'
import { defineComponent } from 'vue'

declare const webviewApi: WebviewApi<VueModel>

class VueModel {
    public roles!: IAM.Role[]
    public roleMode!: 'new-role' | 'select-role'
    public selectedRoleName?: string
}

export default defineComponent({
    name: 'definition-file',
    props: {
        modelValue: {
            type: VueModel,
            default: {
                roles: [],
                roleMode: 'new-role',
                selectedRoleName: '',
            },
        },
    },
    methods: {
        update(key: string, value: string) {
            this.$emit('update:modelValue', { ...this.modelValue, [key]: value })
        },
    },
})
// --vscode-editor-font-family
// --vscode-editor-font-weight
// --vscode-editor-font-size
// https://code.visualstudio.com/api/extension-guides/webview#theming-webview-content
</script>

<style>
body.vscode-dark .config-item[data-disabled='true'] {
    filter: brightness(0.8);
}
body.vscode-light .config-item[data-disabled='true'] {
    filter: brightness(1.2);
}
</style>
