/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TransformationStep } from '../client/codewhispereruserclient'

export function getArtifactIdentifiers(transformationSteps: TransformationStep[]) {
    // const artifactType = transformationSteps[0]?.artifactType
    // const artifactId = transformationSteps[0]?.artifactId
    const artifactType = 'hil'
    const artifactId = 'test-id'
    return {
        artifactId,
        artifactType,
    }
}
