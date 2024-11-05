/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TransformationType, transformByQState } from '../../codewhisperer/models/model'

// For uniquely identifiying which chat messages should be routed to Gumby
export const gumbyChat = 'gumbyChat'

// This sets the tab name
export const featureName = 'Q - Code Transform'

export const dependencyNoAvailableVersions = 'no available versions'

export function getTransformationActionString() {
    return transformByQState.getTransformationType() === TransformationType.LANGUAGE_UPGRADE ? 'upgraded' : 'converted'
}
