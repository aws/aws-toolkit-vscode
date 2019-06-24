/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { CloudFormation } from 'aws-sdk'
import { CloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import { CloudFormationStackLoader } from '../../../shared/cloudformation/cloudformationStackLoader'
import { CANCELLED_ITEMSLOADER_END_EVENT, SUCCESS_ITEMSLOADER_END_EVENT } from '../../../shared/utilities/itemsLoader'
import { asyncGenerator } from '../../utilities/asyncGenerator'
import { MockCloudFormationClient } from '../clients/mockClients'
import { assertThrowsError } from '../utilities/assertUtils'

describe('CloudFormationStackLoader', async () => {
    class TestCloudFormationClient extends MockCloudFormationClient {
        public constructor(
            public listStacks: () => AsyncIterableIterator<CloudFormation.StackSummary> =
                (statusFilter?: string[]) => asyncGenerator([])
        ) {
            super(
                'fake-region',
                undefined,
                (statusFilter?: string[]): AsyncIterableIterator<CloudFormation.StackSummary> => {
                    return this.listStacks()
                },
                undefined,
            )
        }
    }

    class TestCloudFormationStackLoader extends CloudFormationStackLoader {
        public constructor(
            region: string,
            public readonly cloudFormationClient: CloudFormationClient,
        ) {
            super(region)
        }

        protected makeCloudFormationClient(): CloudFormationClient {
            return this.cloudFormationClient
        }
    }

    let stackLoader: TestCloudFormationStackLoader
    beforeEach(async () => {
        stackLoader = new TestCloudFormationStackLoader('fake-region', new TestCloudFormationClient())
    })

    it('loads data', async () => {
        await new Promise<void>(async (resolve) => {
            let itemCount = 0
            stackLoader.onItem(itm => {
                itemCount++
            })
            stackLoader.onLoadEnd((event) => {
                assert.strictEqual(event, SUCCESS_ITEMSLOADER_END_EVENT, 'Expected successful load')
                assert.strictEqual(itemCount, 2, 'unexpected amount of items loaded')
                resolve()
            })

            stackLoader.cloudFormationClient.listStacks = (filter) => {
                return asyncGenerator([
                    makePlaceholderStackSummary('stack1'),
                    makePlaceholderStackSummary('stack2'),
                ])
            }

            await stackLoader.load()
        })
    })

    const loadAsyncError = new Error('error during async iter load')
    async function* loadAsyncIterWithError(): AsyncIterableIterator<CloudFormation.StackSummary> {
        yield* [makePlaceholderStackSummary('stack1')]

        throw loadAsyncError
    }

    it('surfaces errors', async () => {
        await new Promise<void>(async (resolve) => {
            let itemCount = 0
            stackLoader.onItem(itm => {
                itemCount++
            })
            stackLoader.onLoadEnd((event) => {
                assert.strictEqual(event.error, loadAsyncError, 'Expected event error')
                assert.strictEqual(event.success, false, 'Expected failure result')
                assert.strictEqual(itemCount, 1, 'unexpected amount of items loaded')
                resolve()
            })

            stackLoader.cloudFormationClient.listStacks = (filter) => {
                return loadAsyncIterWithError()
            }

            await stackLoader.load()
        })
    })

    it('raises error if load is called more than once', async () => {
        await stackLoader.load()
        await assertThrowsError(
            async () => {
                await stackLoader.load()
            },
            'Expected second call to load to raise Error'
        )
    })

    it('raises error if onItem is accessed after calling load', async () => {
        const loadPromise = stackLoader.load()
        await assertThrowsError(
            async () => {
                stackLoader.onItem(itm => {
                    // irrelevant
                })
            },
            'Expected error trying to access onItem'
        )
        await loadPromise
    })

    it('raises error if onLoadStart is accessed after calling load', async () => {
        const loadPromise = stackLoader.load()
        await assertThrowsError(
            async () => {
                stackLoader.onLoadStart(() => {
                    // irrelevant
                })
            },
            'Expected error trying to access onLoadStart'
        )
        await loadPromise
    })

    it('raises error if onLoadEnd is accessed after calling load', async () => {
        const loadPromise = stackLoader.load()
        await assertThrowsError(
            async () => {
                stackLoader.onLoadEnd((event) => {
                    // irrelevant
                })
            },
            'Expected error trying to access onLoadEnd'
        )
        await loadPromise
    })

    // stops loading with cancellationToken
    it('stops loading data when cancellationToken is triggered', async () => {
        await new Promise<void>(async (resolve) => {
            let itemCount = 0
            stackLoader.onItem(itm => {
                itemCount++
                stackLoader.cancellationToken.requestCancellation()
            })
            stackLoader.onLoadEnd((event) => {
                assert.strictEqual(event, CANCELLED_ITEMSLOADER_END_EVENT, 'Expected cancelled load')
                assert.strictEqual(itemCount, 1, 'unexpected amount of items loaded')
                resolve()
            })

            stackLoader.cloudFormationClient.listStacks = (filter) => {
                return asyncGenerator([
                    makePlaceholderStackSummary('stack1'),
                    makePlaceholderStackSummary('stack2'),
                ])
            }

            await stackLoader.load()
        })
    })
})

function makePlaceholderStackSummary(stackName: string): CloudFormation.StackSummary {
    return {
        StackName: stackName,
        CreationTime: new Date(),
        StackStatus: 'CREATE_COMPLETE'
    }
}
