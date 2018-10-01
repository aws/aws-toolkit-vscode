/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { ResourceLocation } from './resourceLocation'

export interface ResourceFetcher {
    // Attempts to retrieve a resource from the given locations in order, stopping on the first success.
    getResource(resourceLocations: ResourceLocation[]): Promise<string>
}
