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
                    This role has the PowerUserAccess managed policy, which grants permissions for AWS aware application
                    development in the Cloud9 environment.
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
import { defineComponent } from 'vue'
import { createClass, createType } from '../../webviews/util'

export const VueModel = createClass({
    roles: [] as IAM.Role[],
    roleMode: 'new-role' as 'new-role' | 'select-role',
    selectedRoleName: '',
})

export default defineComponent({
    name: 'definition-file',
    props: {
        modelValue: {
            type: createType(VueModel),
            default: new VueModel(),
        },
    },
    methods: {
        update(key: string, value: string) {
            this.$emit('update:modelValue', { ...this.modelValue, [key]: value })
        },
    },
})
</script>

<style scoped>
.config-item {
    display: inline;
    margin-left: 8px;
}
body.vscode-dark .config-item[data-disabled='true'] {
    filter: brightness(0.8);
}
body.vscode-light .config-item[data-disabled='true'] {
    filter: brightness(1.2);
}
</style>
