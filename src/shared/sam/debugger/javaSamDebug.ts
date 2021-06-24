/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getCodeRoot, isImageLambdaConfig } from '../../../lambda/local/debugConfiguration'
import { RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import { ExtContext } from '../../extensions'
import { DefaultSamLocalInvokeCommand, WAIT_FOR_DEBUGGER_MESSAGES } from '../cli/samCliLocalInvoke'
import { makeInputTemplate, runLambdaFunction, waitForPort } from '../localLambdaRunner'
import { SamLaunchRequestArgs } from './awsSamDebugger'

export async function makeJavaConfig(config: SamLaunchRequestArgs): Promise<SamLaunchRequestArgs> {
    if (!config.baseBuildDir) {
        throw Error('invalid state: config.baseBuildDir was not set')
    }

    config = {
        ...config,
        request: config.noDebug ? 'launch' : 'attach',
    }

    config.codeRoot = getCodeRoot(config.workspaceFolder, config)!
    config.templatePath = await makeInputTemplate(config)

    config.type = 'java'
    config.runtimeFamily = RuntimeFamily.Java

    if (!config.noDebug) {
        config.hostName = '127.0.0.1'
        config.port = config.debugPort
        if (isImageLambdaConfig(config)) {
            config.containerEnvVars = {
                _JAVA_OPTIONS:
                    // https://github.com/aws/aws-sam-cli/blob/86f88cbd7df365960f7015c5d086b0db7aedd9d5/samcli/local/docker/lambda_debug_settings.py#L53
                    config.runtime === 'java11'
                        ? `-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,quiet=y,address=*:${config.debugPort} -XX:MaxHeapSize=2834432k -XX:MaxMetaspaceSize=163840k -XX:ReservedCodeCacheSize=81920k -XX:+UseSerialGC -XX:-TieredCompilation -Djava.net.preferIPv4Stack=true`
                        : `-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,quiet=y,address=${config.debugPort} -XX:MaxHeapSize=2834432k -XX:MaxMetaspaceSize=163840k -XX:ReservedCodeCacheSize=81920k -XX:+UseSerialGC -XX:-TieredCompilation -Djava.net.preferIPv4Stack=true -Xshare:off`,
            }
        }
    }

    return config
}

export async function invokeJavaLambda(ctx: ExtContext, config: SamLaunchRequestArgs): Promise<SamLaunchRequestArgs> {
    config.samLocalInvokeCommand = new DefaultSamLocalInvokeCommand([WAIT_FOR_DEBUGGER_MESSAGES.JAVA])
    // eslint-disable-next-line @typescript-eslint/unbound-method
    config.onWillAttachDebugger = async (port, timeout) => {
        await new Promise<void>(async resolve => {
            await waitForPort(port, timeout, true)
            setTimeout(resolve, 1000)
        })
    }
    return await runLambdaFunction(ctx, config, async () => {})
}
