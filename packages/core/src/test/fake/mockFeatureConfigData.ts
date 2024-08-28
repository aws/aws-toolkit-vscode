/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { FeatureEvaluation } from '../../codewhisperer'

export const mockFeatureConfigsData: FeatureEvaluation[] = [
    {
        feature: 'testFeature',
        variation: 'TREATMENT',
        value: { stringValue: 'testValue' },
    },
]
