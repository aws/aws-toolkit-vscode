/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LanguageServerSetup, LanguageServerSetupStage, telemetry } from '../../telemetry/telemetry'
import { tryFunctions } from '../../utilities/tsUtils'

/**
 * Runs the designated stage within a telemetry span and optionally uses the getMetadata extractor to record metadata from the result of the stage.
 * @param stageName name of stage for telemetry.
 * @param runStage stage to be run.
 * @param getMetadata metadata extractor to be applied to result.
 * @returns result of stage
 */
export async function lspSetupStage<Result>(
    stageName: LanguageServerSetupStage,
    runStage: () => Promise<Result>,
    getMetadata?: MetadataExtractor<Result>
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
/**
 * Tries to resolve the result of a stage using the resolvers provided in order. The first one to succceed
 * has its result returned, but all intermediate will emit telemetry.
 * @param stageName name of stage to resolve.
 * @param resolvers stage resolvers to try IN ORDER
 * @param getMetadata function to be applied to result to extract necessary metadata for telemetry.
 * @returns result of the first succesful resolver.
 */
export async function tryStageResolvers<Result>(
    stageName: LanguageServerSetupStage,
    resolvers: StageResolver<Result>[],
    getMetadata: MetadataExtractor<Result>
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

/**
 * A method that returns the result of a stage along with the default telemetry metadata to attach to the stage metric.
 */
export interface StageResolver<Result> {
    resolve: () => Promise<Result>
    telemetryMetadata: Partial<LanguageServerSetup>
}

type MetadataExtractor<R> = (r: R) => Partial<LanguageServerSetup>
