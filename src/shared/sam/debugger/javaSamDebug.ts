/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getCodeRoot } from '../../../lambda/local/debugConfiguration'
import { RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import { ExtContext, VSCODE_EXTENSION_ID } from '../../extensions'
import { getLogger } from '../../logger'
import { DefaultSamLocalInvokeCommand, WAIT_FOR_DEBUGGER_MESSAGES } from '../cli/samCliLocalInvoke'
import { invokeLambdaFunction, makeInputTemplate, waitForPort } from '../localLambdaRunner'
import { SamLaunchRequestArgs } from './awsSamDebugger'

export async function activateJavaExtensionIfInstalled() {
    const extension = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.java)

    // If the extension is not installed, it is not a failure. There may be reduced functionality.
    if (extension && !extension.isActive) {
        getLogger().info('Java CodeLens Provider is activating the Java extension')
        await extension.activate()
    }
}

export async function makeJavaConfig(config: SamLaunchRequestArgs): Promise<SamLaunchRequestArgs> {
    if (!config.baseBuildDir) {
        throw Error('invalid state: config.baseBuildDir was not set')
    }

    config.codeRoot = getCodeRoot(config.workspaceFolder, config)!
    config.templatePath = await makeInputTemplate(config)

    config = {
        ...config,
        type: 'java',
        runtimeFamily: RuntimeFamily.Java,
        request: config.noDebug ? 'launch' : 'attach',
    }

    if (!config.noDebug) {
        config = {
            ...config,
            hostName: '127.0.0.1',
            port: config.debugPort,
        }
    }

    return config
}

export async function invokeJavaLambda(ctx: ExtContext, config: SamLaunchRequestArgs): Promise<SamLaunchRequestArgs> {
    config.samLocalInvokeCommand = new DefaultSamLocalInvokeCommand([WAIT_FOR_DEBUGGER_MESSAGES.JAVA])
    // eslint-disable-next-line @typescript-eslint/unbound-method
    config.onWillAttachDebugger = waitForPort
    return await invokeLambdaFunction(ctx, config, async () => {
        return undefined // do nothing here?
    })
}
