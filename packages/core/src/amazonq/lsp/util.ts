/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LanguageServerSetupStage, telemetry } from '../../shared/telemetry'

export async function lspSetupStage<T>(stageName: LanguageServerSetupStage, stage: () => Promise<T>) {
    return await telemetry.languageServer_setup.run(async (span) => {
        const startTime = performance.now()
        const result = await stage()
        span.record({ languageServerSetupStage: stageName })
        span.record({ duration: performance.now() - startTime })
        return result
    })
}
