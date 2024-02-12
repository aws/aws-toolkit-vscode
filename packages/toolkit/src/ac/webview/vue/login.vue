<template>
    <div v-bind:class="[disabled ? 'disabled-form' : '']" class="auth-container">
        <template v-if="stage === 'START'">
            <div class="auth-container-section">
                <div class="title">Choose a sign-in option</div>
                <SelectableItem
                    v-for="item in items"
                    @toggle="toggleItemSelection"
                    :key="item.id"
                    :isSelected="selectedItem === item.id"
                    :itemId="item.id"
                    :itemText="item.text"
                    class="selectable-item"
                >
                </SelectableItem>
                <button style="background-color: blue; color: white" v-on:click="startSignIn()">Continue</button>
            </div>
        </template>

        <template v-if="stage === 'WAITING_ON_USER'">
            <div class="auth-container-section">
                <button disabled>Follow instructions...</button>
            </div>
        </template>
    </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import SelectableItem from './selectableItem.vue'
//import { AuthWebview } from './backend'
//import { WebviewClientFactory } from '../../../webviews/client'

//const client = WebviewClientFactory.create<AuthWebview>()

/** Where the user is currently in the builder id setup process */
type BuilderIdStage = 'START' | 'WAITING_ON_USER' | 'CONNECTED'

export default defineComponent({
    name: 'Login',
    components: { SelectableItem },
    props: {
        disabled: {
            type: Boolean,
            default: false,
        },
    },
    data() {
        return {
            items: [
                { id: 1, text: 'Create or sign-in using AWS Builder ID' },
                { id: 2, text: 'Single sign-on with AWS IAM Identity Center' },
            ],
            selectedItem: 0,
            stage: 'START' as BuilderIdStage,
            isConnected: false,
            builderIdCode: '',
            name: '',
            error: '' as string,
            submitButtonText: '' as string,
        }
    },
    async created() {
        await this.emitUpdate('created')
    },
    methods: {
        toggleItemSelection(itemId: number) {
            console.log(`ST ${itemId}`)
            this.selectedItem = itemId
        },
        async startSignIn() {},

        /** Updates the content of the form using the state data */
        async updateForm() {},
        async emitUpdate(cause?: string) {},
        async signout() {},
        showNodeInView() {},
    },
})
</script>

<style>
.selectable-item {
    margin-bottom: 10px;
    margin-top: 10px;
}
</style>
