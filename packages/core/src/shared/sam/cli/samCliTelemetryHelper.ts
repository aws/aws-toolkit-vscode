/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { telemetry } from '../../telemetry/telemetry'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'

export class SamCliTelemetryHelper {
    static #instance: SamCliTelemetryHelper

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public recordSamCommand(
        command: 'build' | 'deploy' | 'init' | 'local-invoke' | 'start-api',
        success: boolean,
        duration: number,
        errorCode?: string
    ) {
        telemetry.amazonq_samCommand.emit({
            result: success ? 'Succeeded' : 'Failed',
            amazonqSamCommandType: command,
            amazonqSamCommandDuration: duration,
            amazonqSamErrorCode: errorCode,
            credentialStartUrl: AuthUtil.instance.startUrl,
        })
    }

    public recordSamInit(
        runtime: string,
        template: string,
        success: boolean
    ) {
        telemetry.amazonq_samInit.emit({
            result: success ? 'Succeeded' : 'Failed',
            amazonqSamRuntime: runtime,
            amazonqSamTemplate: template,
            credentialStartUrl: AuthUtil.instance.startUrl,
        })
    }

    public recordSamDeploy(
        stackName: string,
        region: string,
        success: boolean,
        resourceCount?: number
    ) {
        telemetry.amazonq_samDeploy.emit({
            result: success ? 'Succeeded' : 'Failed',
            amazonqSamStackName: stackName,
            amazonqSamRegion: region,
            amazonqSamResourceCount: resourceCount,
            credentialStartUrl: AuthUtil.instance.startUrl,
        })
    }

    public recordSamLocalInvoke(
        functionName: string,
        runtime: string,
        success: boolean,
        duration: number
    ) {
        telemetry.amazonq_samLocalInvoke.emit({
            result: success ? 'Succeeded' : 'Failed',
            amazonqSamFunctionName: functionName,
            amazonqSamRuntime: runtime,
            amazonqSamInvokeDuration: duration,
            credentialStartUrl: AuthUtil.instance.startUrl,
        })
    }
}