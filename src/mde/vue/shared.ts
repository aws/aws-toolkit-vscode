/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { PropType } from 'vue'

export const EnvironmentProp = {
    type: String as PropType<'local' | 'remote'>,
    default: 'local',
}
