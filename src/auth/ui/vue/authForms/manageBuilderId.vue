<template>
    <div class="auth-form container-background border-common" id="builder-id-form">
        <div>
            <FormTitle :isConnected="isConnected">AWS Builder ID</FormTitle>

            <div v-if="stage === 'START'">
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

            <div v-if="stage === 'WAITING_ON_USER'">
                <div class="form-section">
                    <div>Follow instructions...</div>
                </div>
            </div>

            <div v-if="stage === 'CONNECTED'">
                <div class="form-section">
                    <div v-on:click="signout()" style="cursor: pointer; color: #75beff">Sign out</div>
                </div>

                <div class="form-section">
                    <button v-on:click="showNodeInView()">Open {{ name }} in Toolkit</button>
                </div>
            </div>
        </div>
    </div>
</template>
<script lang="ts">
import { PropType, defineComponent } from 'vue'
import BaseAuthForm, { ConnectionUpdateCause } from './baseAuth.vue'
import FormTitle from './formTitle.vue'
import { AuthStatus } from './shared.vue'
import { AuthWebview } from '../show'
import { AuthFormId } from './types'
import { WebviewClientFactory } from '../../../../webviews/client'

const client = WebviewClientFactory.create<AuthWebview>()

/** Where the user is currently in the builder id setup process */
type BuilderIdStage = 'START' | 'WAITING_ON_USER' | 'CONNECTED'

export default defineComponent({
    name: 'CredentialsForm',
    extends: BaseAuthForm,
    components: { FormTitle },
    props: {
        state: {
            type: Object as PropType<BaseBuilderIdState>,
            required: true,
        },
    },
    data() {
        return {
            stage: 'START' as BuilderIdStage,
            isConnected: false,
            builderIdCode: '',
            name: this.state.name,
        }
    },
    async created() {
        await this.update('created')
    },
    methods: {
        async startSignIn() {
            this.stage = 'WAITING_ON_USER'
            await this.state.startBuilderIdSetup()
            await this.update('signIn')
        },
        async update(cause?: ConnectionUpdateCause) {
            this.stage = await this.state.stage()
            this.isConnected = await this.state.isAuthConnected()
            this.emitAuthConnectionUpdated({ id: this.state.id, isConnected: this.isConnected, cause })
        },
        async signout() {
            await this.state.signout()
            this.update('signOut')
        },
        showNodeInView() {
            this.state.showNodeInView()
        },
    },
})

/**
 * Manages the state of Builder ID.
 */
abstract class BaseBuilderIdState implements AuthStatus {
    protected _stage: BuilderIdStage = 'START'

    abstract get name(): string
    abstract get id(): AuthFormId
    protected abstract _startBuilderIdSetup(): Promise<void>
    abstract isAuthConnected(): Promise<boolean>
    abstract showNodeInView(): Promise<void>

    async startBuilderIdSetup(): Promise<void> {
        this._stage = 'WAITING_ON_USER'
        return this._startBuilderIdSetup()
    }

    async stage(): Promise<BuilderIdStage> {
        const isAuthConnected = await this.isAuthConnected()
        this._stage = isAuthConnected ? 'CONNECTED' : 'START'
        return this._stage
    }

    async signout(): Promise<void> {
        await client.signoutBuilderId()
    }
}

export class CodeWhispererBuilderIdState extends BaseBuilderIdState {
    override get name(): string {
        return 'CodeWhisperer'
    }

    override get id(): AuthFormId {
        return 'builderIdCodeWhisperer'
    }

    override isAuthConnected(): Promise<boolean> {
        return client.isCodeWhispererBuilderIdConnected()
    }

    protected override _startBuilderIdSetup(): Promise<void> {
        return client.startCodeWhispererBuilderIdSetup()
    }

    override showNodeInView(): Promise<void> {
        return client.showCodeWhispererNode()
    }
}

export class CodeCatalystBuilderIdState extends BaseBuilderIdState {
    override get name(): string {
        return 'CodeCatalyst'
    }

    override get id(): AuthFormId {
        return 'builderIdCodeCatalyst'
    }

    override isAuthConnected(): Promise<boolean> {
        return client.isCodeCatalystBuilderIdConnected()
    }

    protected override _startBuilderIdSetup(): Promise<void> {
        return client.startCodeCatalystBuilderIdSetup()
    }

    override showNodeInView(): Promise<void> {
        return client.showCodeCatalystNode()
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
