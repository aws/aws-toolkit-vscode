/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getCodeRoot, isImageLambdaConfig } from '../../../lambda/local/debugConfiguration'
import { RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import { ExtContext } from '../../extensions'
import { sleep } from '../../utilities/timeoutUtils'
import { DefaultSamLocalInvokeCommand, waitForDebuggerMessages } from '../cli/samCliLocalInvoke'
import { runLambdaFunction, waitForPort } from '../localLambdaRunner'
import { SamLaunchRequestArgs } from './awsSamDebugger'

export async function makeJavaConfig(config: SamLaunchRequestArgs): Promise<SamLaunchRequestArgs> {
    if (!config.baseBuildDir) {
        throw Error('invalid state: config.baseBuildDir was not set')
    }

    config = {
        ...config,
        request: config.noDebug ? 'launch' : 'attach',
    }

    config.codeRoot = (await getCodeRoot(config.workspaceFolder, config))!

    config.type = 'java'
    config.runtimeFamily = RuntimeFamily.Java

    if (!config.noDebug) {
        config.hostName = '127.0.0.1'
        config.port = config.debugPort
        if (await isImageLambdaConfig(config)) {
            config.containerEnvVars = {
                _JAVA_OPTIONS: getJavaOptionsEnvVar(config),
            }
        }
    }

    return config
}

export async function invokeJavaLambda(ctx: ExtContext, config: SamLaunchRequestArgs): Promise<SamLaunchRequestArgs> {
    config.samLocalInvokeCommand = new DefaultSamLocalInvokeCommand([waitForDebuggerMessages.JAVA])
    // eslint-disable-next-line @typescript-eslint/unbound-method
    config.onWillAttachDebugger = async (port, timeout) => {
        await waitForPort(port, timeout, true)
        await sleep(1000)
    }
    return await runLambdaFunction(ctx, config, async () => {})
}

function getJavaOptionsEnvVar(config: SamLaunchRequestArgs): string {
    switch (config.runtime) {
        case 'java11':
            // https://github.com/aws/aws-sam-cli/blob/86f88cbd7df365960f7015c5d086b0db7aedd9d5/samcli/local/docker/lambda_debug_settings.py#L53
            return `-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,quiet=y,address=*:${config.debugPort} -XX:MaxHeapSize=2834432k -XX:MaxMetaspaceSize=163840k -XX:ReservedCodeCacheSize=81920k -XX:+UseSerialGC -XX:-TieredCompilation -Djava.net.preferIPv4Stack=true`
        case 'java17':
            // https://github.com/aws/aws-sam-cli/blob/90aa5cf11e1c5cbfbe66aea2e2de10d478d48231/samcli/local/docker/lambda_debug_settings.py#L86
            return `-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,quiet=y,address=*:${config.debugPort} -XX:MaxHeapSize=2834432k -XX:+UseSerialGC -XX:+TieredCompilation -XX:TieredStopAtLevel=1 -Djava.net.preferIPv4Stack=true`
        case 'java21':
            // https://github.com/aws/aws-sam-cli/blob/90aa5cf11e1c5cbfbe66aea2e2de10d478d48231/samcli/local/docker/lambda_debug_settings.py#L96
            return `-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,quiet=y,address=*:${config.debugPort} -XX:MaxHeapSize=2834432k -XX:+UseSerialGC -XX:+TieredCompilation -XX:TieredStopAtLevel=1 -Djava.net.preferIPv4Stack=true`
        default:
            return `-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,quiet=y,address=${config.debugPort} -XX:MaxHeapSize=2834432k -XX:MaxMetaspaceSize=163840k -XX:ReservedCodeCacheSize=81920k -XX:+UseSerialGC -XX:-TieredCompilation -Djava.net.preferIPv4Stack=true -Xshare:off`
    }
}
