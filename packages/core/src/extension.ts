/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import * as codecatalyst from './codecatalyst/activation'
import { activate as activateAwsExplorer } from './awsexplorer/activation'
import { activate as activateCloudWatchLogs } from './cloudWatchLogs/activation'
import { CredentialsProviderManager } from './auth/providers/credentialsProviderManager'
import { SharedCredentialsProviderFactory } from './auth/providers/sharedCredentialsProviderFactory'
import { activate as activateSchemas } from './eventSchemas/activation'
import { activate as activateLambda } from './lambda/activation'
import { activate as activateCloudFormationTemplateRegistry } from './shared/cloudformation/activation'
import { AwsContextCommands } from './shared/awsContextCommands'
import {
    getIdeProperties,
    getToolkitEnvironmentDetails,
    isCloud9,
    isSageMaker,
    showWelcomeMessage,
} from './shared/extensionUtilities'
import { getLogger, Logger } from './shared/logger/logger'
import { activate as activateEcr } from './ecr/activation'
import { activate as activateEc2 } from './ec2/activation'
import { activate as activateSam } from './shared/sam/activation'
import { activate as activateS3 } from './s3/activation'
import * as awsFiletypes from './shared/awsFiletypes'
import { activate as activateApiGateway } from './apigateway/activation'
import { activate as activateStepFunctions } from './stepFunctions/activation'
import { activate as activateSsmDocument } from './ssmDocument/activation'
import { activate as activateDynamicResources } from './dynamicResources/activation'
import { activate as activateEcs } from './ecs/activation'
import { activate as activateAppRunner } from './apprunner/activation'
import { activate as activateIot } from './iot/activation'
import { activate as activateDev } from './dev/activation'
import { activate as activateApplicationComposer } from './applicationcomposer/activation'
import { activate as activateRedshift } from './redshift/activation'
import { activate as activateCWChat } from './amazonq/activation'
import { activate as activateQGumby } from './amazonqGumby/activation'
import { Ec2CredentialsProvider } from './auth/providers/ec2CredentialsProvider'
import { EnvVarsCredentialsProvider } from './auth/providers/envVarsCredentialsProvider'
import { EcsCredentialsProvider } from './auth/providers/ecsCredentialsProvider'
import { SchemaService } from './shared/schemas'
import { AwsResourceManager } from './dynamicResources/awsResourceManager'
import globals from './shared/extensionGlobals'
import { Experiments, Settings, showSettingsFailedMsg } from './shared/settings'
import { isReleaseVersion } from './shared/vscode/env'
import { telemetry } from './shared/telemetry/telemetry'
import { Auth } from './auth/auth'
import { initializeNetworkAgent } from './codewhisperer/client/agent'
import { submitFeedback } from './feedback/vue/submitFeedback'
import { activateShared, deactivateShared } from './extensionShared'

let localize: nls.LocalizeFunc

/**
 * The entrypoint for the nodejs version of the toolkit
 *
 * **CONTRIBUTORS** If you are adding code to this function prioritize adding it to
 * {@link activateShared} if appropriate
 */
export async function activate(context: vscode.ExtensionContext) {
    const activationStartedOn = Date.now()
    localize = nls.loadMessageBundle()

    try {
        // IMPORTANT: If you are doing setup that should also work in web mode (browser), it should be done in the function below
        const extContext = await activateShared(context)

        initializeNetworkAgent()
        initializeCredentialsProviderManager()

        const toolkitEnvDetails = getToolkitEnvironmentDetails()
        // Splits environment details by new line, filter removes the empty string
        toolkitEnvDetails
            .split(/\r?\n/)
            .filter(Boolean)
            .forEach(line => getLogger().info(line))

        globals.awsContextCommands = new AwsContextCommands(globals.regionProvider, Auth.instance)
        globals.schemaService = new SchemaService()
        globals.resourceManager = new AwsResourceManager(context)

        const settings = Settings.instance
        const experiments = Experiments.instance

        experiments.onDidChange(({ key }) => {
            telemetry.aws_experimentActivation.run(span => {
                // Record the key prior to reading the setting as `get` may throw
                span.record({ experimentId: key })
                span.record({ experimentState: experiments.get(key) ? 'activated' : 'deactivated' })
            })
        })

        await globals.schemaService.start()
        awsFiletypes.activate()

        try {
            await activateDev(context)
        } catch (error) {
            getLogger().debug(`Developer Tools (internal): failed to activate: ${(error as Error).message}`)
        }

        context.subscriptions.push(submitFeedback.register(context))

        // do not enable codecatalyst for sagemaker
        // TODO: remove setContext if SageMaker adds the context to their IDE
        if (!isSageMaker()) {
            await vscode.commands.executeCommand('setContext', 'aws.isSageMaker', false)
            await codecatalyst.activate(extContext)
        } else {
            await vscode.commands.executeCommand('setContext', 'aws.isSageMaker', true)
        }

        await activateCloudFormationTemplateRegistry(context)

        await activateAwsExplorer({
            context: extContext,
            regionProvider: globals.regionProvider,
            toolkitOutputChannel: globals.outputChannel,
            remoteInvokeOutputChannel: globals.invokeOutputChannel,
        })

        await activateAppRunner(extContext)

        await activateApiGateway({
            extContext: extContext,
            outputChannel: globals.invokeOutputChannel,
        })

        await activateLambda(extContext)

        await activateSsmDocument(context, globals.awsContext, globals.regionProvider, globals.outputChannel)

        await activateSam(extContext)

        await activateS3(extContext)

        await activateEc2(extContext)

        await activateEcr(context)

        await activateCloudWatchLogs(context, settings)

        await activateDynamicResources(context)

        await activateIot(extContext)

        await activateEcs(extContext)

        await activateSchemas(extContext)

        if (!isCloud9()) {
            if (!isSageMaker()) {
                await activateCWChat(extContext.extensionContext)
                await activateQGumby(extContext)
            }
            await activateApplicationComposer(context)
        }

        await activateStepFunctions(context, globals.awsContext, globals.outputChannel)

        await activateRedshift(extContext)

        context.subscriptions.push(
            vscode.window.registerUriHandler({
                handleUri: uri =>
                    telemetry.runRoot(() => {
                        telemetry.record({ source: 'UriHandler' })

                        return globals.uriHandler.handleUri(uri)
                    }),
            })
        )

        showWelcomeMessage(context)

        const settingsValid = await settings.isReadable()
        if (!settingsValid) {
            void showSettingsFailedMsg('read')
        }
        recordToolkitInitialization(activationStartedOn, settingsValid, getLogger())

        if (!isReleaseVersion()) {
            globals.telemetry.assertPassiveTelemetry(globals.didReload)
        }
    } catch (error) {
        const stacktrace = (error as Error).stack?.split('\n')
        // truncate if the stacktrace is unusually long
        if (stacktrace !== undefined && stacktrace.length > 40) {
            stacktrace.length = 40
        }
        getLogger('channel').error(
            localize(
                'AWS.channel.aws.toolkit.activation.error',
                'Error Activating {0} Toolkit: {1} \n{2}',
                getIdeProperties().company,
                (error as Error).message,
                stacktrace?.join('\n')
            )
        )
        throw error
    }
}

export async function deactivate() {
    await deactivateShared()
    await globals.resourceManager.dispose()
}

function initializeCredentialsProviderManager() {
    const manager = CredentialsProviderManager.getInstance()
    manager.addProviderFactory(new SharedCredentialsProviderFactory())
    manager.addProviders(new Ec2CredentialsProvider(), new EcsCredentialsProvider(), new EnvVarsCredentialsProvider())
}

function recordToolkitInitialization(activationStartedOn: number, settingsValid: boolean, logger?: Logger) {
    try {
        const activationFinishedOn = Date.now()
        const duration = activationFinishedOn - activationStartedOn

        if (settingsValid) {
            telemetry.toolkit_init.emit({ duration, result: 'Succeeded' })
        } else {
            telemetry.toolkit_init.emit({ duration, result: 'Failed', reason: 'UserSettingsRead' })
        }
    } catch (err) {
        logger?.error(err as Error)
    }
}

// Unique extension entrypoint names, so that they can be obtained from the webpack bundle
export const awsToolkitActivate = activate
export const awsToolkitDeactivate = deactivate
