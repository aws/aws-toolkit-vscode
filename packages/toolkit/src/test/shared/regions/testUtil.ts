/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Memento } from 'vscode'
import { AwsContext } from '../../../shared/awsContext'
import { RegionProvider } from '../../../shared/regions/regionProvider'

export const DEFAULT_TEST_REGION_CODE = 'someRegion' // eslint-disable-line @typescript-eslint/naming-convention
export const DEFAULT_TEST_REGION_NAME = 'Some Region' // eslint-disable-line @typescript-eslint/naming-convention

const endpoints = {
    partitions: [
        {
            dnsSuffix: 'totallyLegit.tld',
            id: 'aws',
            name: 'AWS',
            regions: [
                {
                    id: DEFAULT_TEST_REGION_CODE,
                    name: DEFAULT_TEST_REGION_NAME,
                },
                {
                    id: 'us-west-2',
                    name: 'US West (N. California)',
                },
            ],
            services: [
                {
                    id: 'someService',
                    endpoints: [
                        {
                            regionId: DEFAULT_TEST_REGION_CODE,
                            data: {},
                        },
                    ],
                },
            ],
        },
    ],
}

export function createTestRegionProvider(opts?: {
    globalState?: Memento & { setKeysForSync(keys: readonly string[]): void }
    awsContext?: AwsContext
}): RegionProvider {
    return new RegionProvider(endpoints, opts?.globalState, opts?.awsContext)
}
