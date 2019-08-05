/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'

import { AWSError, ECS } from 'aws-sdk'
import { DefaultEcsClient } from '../../../shared/clients/defaultEcsClient'
import { assertThrowsError } from '../utilities/assertUtils'

describe('defaultEcsClient', async () => {

    let testClient: TestEcsClient

    before(() => {
        testClient = new TestEcsClient()
    })

    describe('listClusters', async () => {

        it('lists clusters from a single page', async () => {
            const targetArr = ['cluster1', 'cluster2', 'cluster3']
            testClient.listClustersResponses = [{
                clusterArns: targetArr
            }]
            const iterator = testClient.listClusters()
            const arr = []
            for await (const item of iterator) {
                arr.push(item)
            }
            assert.deepStrictEqual(targetArr, arr)
        })

        it('lists clusters from multiple pages', async () => {
            const targetArr1 = ['cluster1', 'cluster2', 'cluster3']
            const targetArr2 = ['cluster4', 'cluster5', 'cluster6']
            const targetArr3 = ['cluster7', 'cluster8', 'cluster9']
            testClient.listClustersResponses = [
                {
                    clusterArns: targetArr1,
                    nextToken: 'what else you got'
                },
                {
                    clusterArns: targetArr2,
                    nextToken: 'may i have some more'
                },
                {
                    clusterArns: targetArr3
                }
            ]
            const iterator = testClient.listClusters()
            const arr = []
            for await (const item of iterator) {
                arr.push(item)
            }
            assert.deepStrictEqual(targetArr1.concat(targetArr2).concat(targetArr3), arr)
        })

        it('handles errors', async () => {
            testClient.listClustersResponses = new Error() as AWSError
            await assertThrowsError(async () => {
                const iterator = testClient.listClusters()
                const arr = []
                for await (const item of iterator) {
                    arr.push(item)
                }
            })
        })
    })

    describe('listServices', async () => {

        it('lists services from a single page', async () => {
            const targetArr = ['service1', 'service2', 'service3']
            testClient.listServicesResponses = [{
                serviceArns: targetArr
            }]
            const iterator = testClient.listServices('mycluster')
            const arr = []
            for await (const item of iterator) {
                arr.push(item)
            }
            assert.deepStrictEqual(targetArr, arr)
        })

        it('lists services from multiple pages', async () => {
            const targetArr1 = ['service1', 'service2', 'service3']
            const targetArr2 = ['service4', 'service5', 'service6']
            const targetArr3 = ['service7', 'service8', 'service9']
            testClient.listServicesResponses = [
                {
                    serviceArns: targetArr1,
                    nextToken: 'theres more where that came from'
                },
                {
                    serviceArns: targetArr2,
                    nextToken: 'theres still more where that came from'
                },
                {
                    serviceArns: targetArr3
                }
            ]
            const iterator = testClient.listServices('yourcluster')
            const arr = []
            for await (const item of iterator) {
                arr.push(item)
            }
            assert.deepStrictEqual(targetArr1.concat(targetArr2).concat(targetArr3), arr)
        })

        it('handles errors', async () => {
            testClient.listServicesResponses = new Error() as AWSError
            await assertThrowsError(async () => {
                const iterator = testClient.listServices('ourcluster')
                const arr = []
                for await (const item of iterator) {
                    arr.push(item)
                }
            })
        })
    })

    describe('ListTaskDefinitions', async () => {

        it('lists task definitions from a single page', async () => {
            const targetArr = ['arn1', 'arn2', 'arn3']
            testClient.listTaskDefinitionsResponses = [{
                taskDefinitionArns: targetArr
            }]
            const iterator = testClient.listTaskDefinitions()
            const arr = []
            for await (const item of iterator) {
                arr.push(item)
            }
            assert.deepStrictEqual(targetArr, arr)
        })

        it('lists task definitions from multiple pages', async () => {
            const targetArr1 = ['arn1', 'arn2', 'arn3']
            const targetArr2 = ['arn4', 'arn5', 'arn6']
            const targetArr3 = ['arn7', 'arn8', 'arn9']
            testClient.listTaskDefinitionsResponses = [
                {
                    taskDefinitionArns: targetArr1,
                    nextToken: 'there i go, turn the page'
                },
                {
                    taskDefinitionArns: targetArr2,
                    nextToken: 'you can write a book with all these pages'
                },
                {
                    taskDefinitionArns: targetArr3
                }
            ]
            const iterator = testClient.listTaskDefinitions()
            const arr = []
            for await (const item of iterator) {
                arr.push(item)
            }
            assert.deepStrictEqual(targetArr1.concat(targetArr2).concat(targetArr3), arr)
        })

        it('handles errors', async () => {
            testClient.listTaskDefinitionsResponses = new Error() as AWSError
            await assertThrowsError(async () => {
                const iterator = testClient.listTaskDefinitions()
                const arr = []
                for await (const item of iterator) {
                    arr.push(item)
                }
            })
        })
    })
})

class TestEcsClient extends DefaultEcsClient {

    public listClustersResponses: ECS.ListClustersResponse[] | AWSError = [{}]

    public listServicesResponses: ECS.ListServicesResponse[] | AWSError = [{}]

    public listTaskDefinitionsResponses: ECS.ListTaskDefinitionsResponse[] | AWSError = [{}]

    private pageNum: number = 0

    public constructor(
        regionCode: string = 'us-weast-1'
    ) {
        super(regionCode)
    }

    protected async invokeListClusters(request: ECS.ListClustersRequest)
        : Promise<ECS.ListClustersResponse> {
        const responseDatum
            = this.getResponseDatum<ECS.ListClustersResponse>(this.listClustersResponses, request.nextToken)

        if (responseDatum instanceof Error) {
            throw responseDatum
        } else {
            return responseDatum
        }
    }

    protected async invokeListServices(request: ECS.ListServicesRequest)
        : Promise<ECS.ListServicesResponse> {
        const responseDatum
            = this.getResponseDatum<ECS.ListServicesResponse>(this.listServicesResponses, request.nextToken)

        if (responseDatum instanceof Error) {
            throw responseDatum
        } else {
            return responseDatum
        }
    }

    protected async invokeListTaskDefinitions(request: ECS.ListTaskDefinitionsRequest)
        : Promise<ECS.ListTaskDefinitionsResponse> {
        const responseDatum =
            this.getResponseDatum<ECS.ListTaskDefinitionsResponse>(this.listTaskDefinitionsResponses, request.nextToken)

        if (responseDatum instanceof Error) {
            throw responseDatum
        } else {
            return responseDatum
        }
    }

    protected async createSdkClient(): Promise<ECS> {
        return {} as any as ECS
    }

    private getResponseDatum<T>(responses: T[] | AWSError, nextToken?: string): T | AWSError {
        if (!nextToken) {
            this.pageNum = 0
        }
        if (responses instanceof Error) {
            return responses
        }
        const response = responses[this.pageNum]
        this.pageNum++

        return response
    }
}
