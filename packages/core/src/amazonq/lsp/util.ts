/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LanguageServerSetup, LanguageServerSetupStage, telemetry } from '../../shared/telemetry'
import { tryFunctions } from '../../shared/utilities/tsUtils'

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
    getMetadata?: MetadataExtracter<T>
) {
    return await telemetry.languageServer_setup.run(async (span) => {
        span.record({ languageServerSetupStage: stageName })
        const result = await runStage()
        if (getMetadata) {
            span.record(getMetadata(result))
        }
        return result
    })
}

export async function tryResolvers<Result>(
    stageName: LanguageServerSetupStage,
    resolvers: StageResolver<Result>[],
    getMetadata: MetadataExtracter<Result>
) {
    const fs = resolvers.map((resolver) => async () => {
        return await lspSetupStage(
            stageName,
            async () => {
                telemetry.record(resolver.telemetryMetadata)
                const result = await resolver.resolve()
                return result
            },
            getMetadata
        )
    })

    return await tryFunctions(fs)
}

export interface StageResolver<Result> {
    resolve: () => Promise<Result>
    telemetryMetadata: Partial<LanguageServerSetup>
}

type MetadataExtracter<R> = (r: R) => Partial<LanguageServerSetup>
