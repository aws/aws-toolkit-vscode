<template>
    <div class="auth-form container-background border-common" id="builder-id-form">
        <div v-show="canShowAll">
            <FormTitle :isConnected="isConnected">AWS Builder ID</FormTitle>

            <div v-if="stage === stages.START">
                <div class="form-section">
                    <div>
                        With AWS Builder ID, sign in for free without an AWS account.
                        <a href="https://docs.aws.amazon.com/signin/latest/userguide/sign-in-aws_builder_id.html"
                            >Read more.</a
                        >
                    </div>
                </div>

                <div class="form-section">
                    <button v-on:click="startSignIn()">Sign up or Sign in</button>
                </div>
            </div>

            <div v-if="stage === stages.WAITING_ON_USER">
                <div class="form-section">
                    <div>Follow instructions...</div>
                </div>
            </div>

            <div v-if="stage === stages.CONNECTED">
                <div class="form-section">
                    <div v-on:click="signout()" style="cursor: pointer; color: #75beff">Sign out</div>
                </div>
            </div>
        </div>
    </div>
</template>
<script lang="ts">
import { PropType, defineComponent } from 'vue'
import BaseAuthForm from './baseAuth.vue'
import FormTitle from './formTitle.vue'
import { AuthStatus } from './shared.vue'
import { WebviewClientFactory } from '../../../webviews/client'
import { AuthWebview } from '../show'
import authForms, { AuthFormId } from './types.vue'

const client = WebviewClientFactory.create<AuthWebview>()

/** Where the user is currently in the builder id setup process */
export const stages = {
    START: 'START',
    WAITING_ON_USER: 'WAITING_ON_USER',
    CONNECTED: 'CONNECTED',
} as const
type BuilderIdStage = (typeof stages)[keyof typeof stages]

export default defineComponent({
    name: 'CredentialsForm',
    extends: BaseAuthForm,
    components: { FormTitle },
    props: {
        state: {
            type: Object as PropType<BaseBuilderIdState>,
            required: true,
        },
        stages: {
            type: Object as PropType<typeof stages>,
            default: stages,
        },
    },
    data() {
        return {
            stage: stages.START as BuilderIdStage,
            isConnected: false,
            builderIdCode: '',
            canShowAll: false,
        }
    },
    async created() {
        await this.update()
        this.canShowAll = true
    },
    methods: {
        async startSignIn() {
            this.stage = this.stages.WAITING_ON_USER
            await this.state.startBuilderIdSetup()
            await this.update()
        },
        async update() {
            this.stage = await this.state.stage()
            this.isConnected = await this.state.isAuthConnected()
            this.emitAuthConnectionUpdated(this.state.id)
        },
        async signout() {
            await this.state.signout()

            this.update()
        },
    },
})

/**
 * Manages the state of Builder ID.
 */
abstract class BaseBuilderIdState implements AuthStatus {
    protected _stage: BuilderIdStage = stages.START

    abstract get id(): AuthFormId
    protected abstract _startBuilderIdSetup(): Promise<void>
    abstract isAuthConnected(): Promise<boolean>

    async startBuilderIdSetup(): Promise<void> {
        this._stage = stages.WAITING_ON_USER
        return this._startBuilderIdSetup()
    }

    async stage(): Promise<BuilderIdStage> {
        const isAuthConnected = await this.isAuthConnected()
        this._stage = isAuthConnected ? stages.CONNECTED : stages.START
        return this._stage
    }

    async signout(): Promise<void> {
        await client.signoutBuilderId()
    }
}

export class CodeWhispererBuilderIdState extends BaseBuilderIdState {
    override get id(): AuthFormId {
        return authForms.BUILDER_ID_CODE_WHISPERER
    }

    override isAuthConnected(): Promise<boolean> {
        return client.isCodeWhispererBuilderIdConnected()
    }

    protected override _startBuilderIdSetup(): Promise<void> {
        return client.startCodeWhispererBuilderIdSetup()
    }
}

export class CodeCatalystBuilderIdState extends BaseBuilderIdState {
    override get id(): AuthFormId {
        return authForms.BUILDER_ID_CODE_CATALYST
    }

    override isAuthConnected(): Promise<boolean> {
        return client.isCodeCatalystBuilderIdConnected()
    }

    protected override _startBuilderIdSetup(): Promise<void> {
        return client.startCodeCatalystBuilderIdSetup()
    }
}
</script>
<style>
@import './sharedAuthForms.css';
@import '../shared.css';

#builder-id-form {
    width: 250px;
    height: fit-content;
}
</style>
