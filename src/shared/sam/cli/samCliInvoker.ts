/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { extensionSettingsPrefix } from '../../constants'
import { getLogger } from '../../logger'
import { DefaultSettingsConfiguration } from '../../settingsConfiguration'
import { ChildProcess, ChildProcessResult } from '../../utilities/childProcess'
import { DefaultSamCliConfiguration, SamCliConfiguration } from './samCliConfiguration'
import {
    makeRequiredSamCliProcessInvokeOptions,
    SamCliProcessInvokeOptions,
    SamCliProcessInvoker
} from './samCliInvokerUtils'
import { DefaultSamCliLocationProvider } from './samCliLocator'

export interface SamCliProcessInvokerContext {
    cliConfig: SamCliConfiguration
}

export class DefaultSamCliProcessInvokerContext implements SamCliProcessInvokerContext {
    public cliConfig: SamCliConfiguration = new DefaultSamCliConfiguration(
        new DefaultSettingsConfiguration(extensionSettingsPrefix),
        new DefaultSamCliLocationProvider()
    )
}

export function resolveSamCliProcessInvokerContext(
    params: Partial<SamCliProcessInvokerContext> = {}
): SamCliProcessInvokerContext {
    const defaults = new DefaultSamCliProcessInvokerContext()

    return {
        cliConfig: params.cliConfig || defaults.cliConfig
    }
}

export class DefaultSamCliProcessInvoker implements SamCliProcessInvoker {
    public constructor(private readonly context: SamCliProcessInvokerContext = resolveSamCliProcessInvokerContext()) {}

    public async invoke(options?: SamCliProcessInvokeOptions): Promise<ChildProcessResult> {
        const invokeOptions = makeRequiredSamCliProcessInvokeOptions(options)

        const childProcess: ChildProcess = new ChildProcess(
            this.samCliLocation,
            invokeOptions.spawnOptions,
            ...invokeOptions.arguments
        )

        return await childProcess.run()
    }

    // Gets SAM CLI Location, throws if not found
    private get samCliLocation(): string {
        const samCliLocation: string | undefined = this.context.cliConfig.getSamCliLocation()
        if (!samCliLocation) {
            const err = new Error('SAM CLI location not configured')
            getLogger().error(err)
            throw err
        }

        return samCliLocation
    }
}
