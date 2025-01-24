/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LanguageServerSetup, LanguageServerSetupStage, telemetry } from '../../shared/telemetry'

/**
 * Runs the designated stage within a telemetry span and optionally uses the getMetadata extractor to record metadata from the result of the stage.
 * @param stageName name of stage for telemetry.
 * @param runStage stage to be run.
 * @param getMetadata metadata extracter to be applied to result.
 * @returns result of stage
 */
export async function lspSetupStage<T>(
    stageName: LanguageServerSetupStage,
    runStage: () => Promise<T>,
    getMetadata?: (result: T) => Partial<LanguageServerSetup>
) {
    return await telemetry.languageServer_setup.run(async (span) => {
        const result = await runStage()
        span.record({ languageServerSetupStage: stageName })
        if (getMetadata) {
            span.record(getMetadata(result))
        }
        return result
    })
}
