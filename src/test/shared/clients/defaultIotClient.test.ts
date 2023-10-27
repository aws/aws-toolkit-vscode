/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { AWSError, Request } from 'aws-sdk';

import {
    AttachPolicyCommandInput,
    AttachThingPrincipalCommandInput,
    CreateKeysAndCertificateCommandInput,
    CreateKeysAndCertificateCommandOutput,
    CreatePolicyCommandInput,
    CreatePolicyCommandOutput,
    CreatePolicyVersionCommandInput,
    CreatePolicyVersionCommandOutput,
    CreateThingCommandOutput,
    DeleteCertificateCommandInput,
    DeletePolicyCommandInput,
    DeletePolicyVersionCommandInput,
    DeleteThingCommandInput,
    DeleteThingCommandOutput,
    DescribeCertificateCommandInput,
    DescribeCertificateCommandOutput,
    DescribeEndpointCommandInput,
    DescribeEndpointCommandOutput,
    DetachPolicyCommandInput,
    DetachThingPrincipalCommandInput,
    GetPolicyVersionCommandInput,
    GetPolicyVersionCommandOutput,
    IoT,
    ListCertificatesCommandInput,
    ListCertificatesCommandOutput,
    ListPoliciesCommandInput,
    ListPoliciesCommandOutput,
    ListPolicyVersionsCommandInput,
    ListPolicyVersionsCommandOutput,
    ListPrincipalPoliciesCommandInput,
    ListPrincipalThingsCommandInput,
    ListPrincipalThingsCommandOutput,
    ListTargetsForPolicyCommandInput,
    ListTargetsForPolicyCommandOutput,
    ListThingPrincipalsCommandInput,
    ListThingPrincipalsCommandOutput,
    ListThingsCommandInput,
    ListThingsCommandOutput,
    PolicyVersion,
    SetDefaultPolicyVersionCommandInput,
    UpdateCertificateCommandInput,
} from "@aws-sdk/client-iot";

import { anything, deepEqual, instance, mock, verify, when } from '../../utilities/mockito'
import { DefaultIotClient, ListThingCertificatesResponse } from '../../../shared/clients/iotClient'

class FakeAwsError extends Error {
    public region: string = 'us-west-2'

    public constructor(message: string) {
        super(message)
    }
}

describe('DefaultIotClient', function () {
    const region = 'us-west-2'
    const thingName = 'thing'
    const policyName = 'policy'
    const policyDocument = '{ "key": "value" }'
    const nextToken = 'nextToken'
    const marker = nextToken
    const maxResults = 10
    const pageSize = maxResults
    let mockIot: Iot

    beforeEach(function () {
        mockIot = mock()
    })

    const error: AWSError = new FakeAwsError('Expected failure') as AWSError

    function success<T>(output?: T): Request<T, AWSError> {
        return {
            promise: () => Promise.resolve(output),
        } as Request<any, AWSError>
    }

    function failure(): Request<any, AWSError> {
        return {
            promise: () => Promise.reject(error),
        } as Request<any, AWSError>
    }

    function createClient({ regionCode = region }: { regionCode?: string } = {}): DefaultIotClient {
        return new DefaultIotClient(regionCode, () => Promise.resolve(instance(mockIot)))
    }

    /* Functions that create or retrieve resources. */

    describe('createThing', function () {
        const expectedResponse: CreateThingCommandOutput = { thingName: thingName, thingArn: 'arn' }
        it('creates a thing', async function () {
            when(
                mockIot.createThing(
                    deepEqual({
                        thingName: thingName,
                    })
                )
            ).thenReturn(success(expectedResponse))

            const response = await createClient().createThing({ thingName })

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            when(mockIot.createThing(anything())).thenReturn(failure())

            await assert.rejects(createClient().createThing({ thingName }), error)
        })
    })

    describe('createCertificateAndKeys', function () {
        const certificateId = 'cert1'
        const input: CreateKeysAndCertificateCommandInput = { setAsActive: undefined }
        const expectedResponse: CreateKeysAndCertificateCommandOutput = {
            certificateId,
            certificateArn: 'arn',
            certificatePem: 'pem',
            keyPair: { PublicKey: 'publicKey', PrivateKey: 'privateKey' },
        }

        it('creates Certificate and Key Pair', async function () {
            when(mockIot.createKeysAndCertificate(deepEqual(input))).thenReturn(success(expectedResponse))

            const response = await createClient().createCertificateAndKeys(input)

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            when(mockIot.createKeysAndCertificate(anything())).thenReturn(failure())

            await assert.rejects(createClient().createCertificateAndKeys(input), error)
        })
    })

    describe('getEndpoint', function () {
        const input: DescribeEndpointCommandInput = { endpointType: 'iot:Data-ATS' }
        const endpointAddress = 'address'
        const describeResponse: DescribeEndpointCommandOutput = { endpointAddress }

        it('gets endpoint', async function () {
            when(mockIot.describeEndpoint(deepEqual(input))).thenReturn(success(describeResponse))

            const response = await createClient().getEndpoint()

            assert.deepStrictEqual(response, endpointAddress)
        })

        it('throws an Error on failure', async function () {
            when(mockIot.describeEndpoint(anything())).thenReturn(failure())

            await assert.rejects(createClient().getEndpoint(), error)
        })
    })

    describe('getPolicyVersion', function () {
        const input: GetPolicyVersionCommandInput = { policyName, policyVersionId: '1' }
        const expectedResponse: GetPolicyVersionCommandOutput = {
            policyName,
            policyDocument,
            policyArn: 'arn1',
            policyVersionId: '1',
        }

        it('gets policy document for version', async function () {
            when(mockIot.getPolicyVersion(deepEqual(input))).thenReturn(success(expectedResponse))

            const response = await createClient().getPolicyVersion(input)

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            when(mockIot.getPolicyVersion(anything())).thenReturn(failure())

            await assert.rejects(createClient().getPolicyVersion(input), error)
        })
    })

    /* Functions that return void .*/

    describe('deleteThing', function () {
        const input: DeleteThingCommandInput = { thingName }

        it('deletes a thing', async function () {
            when(
                mockIot.deleteThing(
                    deepEqual({
                        thingName: thingName,
                    })
                )
            ).thenReturn(success({} as DeleteThingCommandOutput))

            await createClient().deleteThing({ thingName })

            verify(mockIot.deleteThing(deepEqual(input))).once()
        })

        it('throws an Error on failure', async function () {
            when(mockIot.deleteThing(anything())).thenReturn(failure())

            await assert.rejects(createClient().deleteThing({ thingName }), error)
        })
    })

    describe('deleteCertificate', function () {
        const certificateId = 'cert1'
        const input: DeleteCertificateCommandInput = { certificateId, forceDelete: undefined }

        it('deletes a certificate', async function () {
            when(mockIot.deleteCertificate(deepEqual(input))).thenReturn(success())

            await createClient().deleteCertificate(input)

            verify(mockIot.deleteCertificate(deepEqual(input))).once()
        })

        it('throws an Error on failure', async function () {
            when(mockIot.deleteCertificate(anything())).thenReturn(failure())

            await assert.rejects(createClient().deleteCertificate(input), error)
        })
    })

    describe('updateCertificate', function () {
        const certificateId = 'cert1'
        const input: UpdateCertificateCommandInput = { certificateId, newStatus: 'ACTIVE' }

        it('updates a certificate', async function () {
            when(mockIot.updateCertificate(deepEqual(input))).thenReturn(success())

            await createClient().updateCertificate(input)

            verify(mockIot.updateCertificate(deepEqual(input))).once()
        })

        it('throws an Error on failure', async function () {
            when(mockIot.updateCertificate(anything())).thenReturn(failure())

            await assert.rejects(createClient().updateCertificate(input), error)
        })
    })

    describe('attachThingPrincipal', function () {
        const input: AttachThingPrincipalCommandInput = { thingName, principal: 'arn1' }

        it('attaches a certificate to a Thing', async function () {
            when(mockIot.attachThingPrincipal(deepEqual(input))).thenReturn(success())

            await createClient().attachThingPrincipal(input)

            verify(mockIot.attachThingPrincipal(deepEqual(input))).once()
        })

        it('throws an Error on failure', async function () {
            when(mockIot.attachThingPrincipal(anything())).thenReturn(failure())

            await assert.rejects(createClient().attachThingPrincipal(input), error)
        })
    })

    describe('detachThingPrincipal', function () {
        const input: DetachThingPrincipalCommandInput = { thingName, principal: 'arn1' }

        it('detaches a certificate from a Thing', async function () {
            when(mockIot.detachThingPrincipal(deepEqual(input))).thenReturn(success())

            await createClient().detachThingPrincipal(input)

            verify(mockIot.detachThingPrincipal(deepEqual(input))).once()
        })

        it('throws an Error on failure', async function () {
            when(mockIot.detachThingPrincipal(anything())).thenReturn(failure())

            await assert.rejects(createClient().detachThingPrincipal(input), error)
        })
    })

    describe('attachPolicy', function () {
        const input: AttachPolicyCommandInput = { policyName, target: 'arn1' }

        it('attaches a policy to a certificate', async function () {
            when(mockIot.attachPolicy(deepEqual(input))).thenReturn(success())

            await createClient().attachPolicy(input)

            verify(mockIot.attachPolicy(deepEqual(input))).once()
        })

        it('throws an Error on failure', async function () {
            when(mockIot.attachPolicy(anything())).thenReturn(failure())

            await assert.rejects(createClient().attachPolicy(input), error)
        })
    })

    describe('detachPolicy', function () {
        const input: DetachPolicyCommandInput = { policyName, target: 'arn1' }

        it('detaches a policy from a certificate', async function () {
            when(mockIot.detachPolicy(deepEqual(input))).thenReturn(success())

            await createClient().detachPolicy(input)

            verify(mockIot.detachPolicy(deepEqual(input))).once()
        })

        it('throws an Error on failure', async function () {
            when(mockIot.detachPolicy(anything())).thenReturn(failure())

            await assert.rejects(createClient().detachPolicy(input), error)
        })
    })

    describe('createPolicy', function () {
        const input: CreatePolicyCommandInput = { policyName, policyDocument }
        const expectedResponse: CreatePolicyCommandOutput = { policyName, policyDocument, policyArn: 'arn1' }

        it('creates a policy from a document', async function () {
            when(mockIot.createPolicy(deepEqual(input))).thenReturn(success(expectedResponse))

            await createClient().createPolicy(input)

            verify(mockIot.createPolicy(deepEqual(input))).once()
        })

        it('throws an Error on failure', async function () {
            when(mockIot.createPolicy(anything())).thenReturn(failure())

            await assert.rejects(createClient().createPolicy(input), error)
        })
    })

    describe('deletePolicy', function () {
        const input: DeletePolicyCommandInput = { policyName }

        it('deletes a policy', async function () {
            when(mockIot.deletePolicy(deepEqual(input))).thenReturn(success())

            await createClient().deletePolicy(input)

            verify(mockIot.deletePolicy(deepEqual(input))).once()
        })

        it('throws an Error on failure', async function () {
            when(mockIot.deletePolicy(anything())).thenReturn(failure())

            await assert.rejects(createClient().deletePolicy(input), error)
        })
    })

    describe('createPolicyVersion', function () {
        const input: CreatePolicyVersionCommandInput = { policyName, policyDocument }
        const expectedResponse: CreatePolicyVersionCommandOutput = { policyDocument, policyArn: 'arn1' }

        it('creates a policy version from a document', async function () {
            when(mockIot.createPolicyVersion(deepEqual(input))).thenReturn(success(expectedResponse))

            await createClient().createPolicyVersion(input)

            verify(mockIot.createPolicyVersion(deepEqual(input))).once()
        })

        it('throws an Error on failure', async function () {
            when(mockIot.createPolicyVersion(anything())).thenReturn(failure())

            await assert.rejects(createClient().createPolicyVersion(input), error)
        })
    })

    describe('deletePolicyVersion', function () {
        const input: DeletePolicyVersionCommandInput = { policyName, policyVersionId: '1' }

        it('deletes a policy version', async function () {
            when(mockIot.deletePolicyVersion(deepEqual(input))).thenReturn(success())

            await createClient().deletePolicyVersion(input)

            verify(mockIot.deletePolicyVersion(deepEqual(input))).once()
        })

        it('throws an Error on failure', async function () {
            when(mockIot.deletePolicyVersion(anything())).thenReturn(failure())

            await assert.rejects(createClient().deletePolicyVersion(input), error)
        })
    })

    describe('setDefaultPolicyVersion', function () {
        const input: SetDefaultPolicyVersionCommandInput = { policyName, policyVersionId: '1' }

        it('deletes a policy version', async function () {
            when(mockIot.setDefaultPolicyVersion(deepEqual(input))).thenReturn(success())

            await createClient().setDefaultPolicyVersion(input)

            verify(mockIot.setDefaultPolicyVersion(deepEqual(input))).once()
        })

        it('throws an Error on failure', async function () {
            when(mockIot.setDefaultPolicyVersion(anything())).thenReturn(failure())

            await assert.rejects(createClient().setDefaultPolicyVersion(input), error)
        })
    })

    /* Functions that list resources. */

    describe('listThings', function () {
        const input: ListThingsCommandInput = { maxResults, nextToken }
        const expectedResponse: ListThingsCommandOutput = { things: [{ thingName: 'thing1' }], nextToken }

        it('lists things', async function () {
            when(mockIot.listThings(deepEqual(input))).thenReturn(success(expectedResponse))

            const response = await createClient().listThings(input)

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            when(mockIot.listThings(anything())).thenReturn(failure())

            await assert.rejects(createClient().listThings(input), error)
        })
    })

    describe('listCertificates', function () {
        const input: ListCertificatesCommandInput = { pageSize, marker, ascendingOrder: undefined }
        const expectedResponse: ListCertificatesCommandOutput = {
            certificates: [{ certificateId: 'cert1' }],
            nextMarker: marker,
        }

        it('lists certificates', async function () {
            when(mockIot.listCertificates(deepEqual(input))).thenReturn(success(expectedResponse))

            const response = await createClient().listCertificates(input)

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            when(mockIot.listCertificates(anything())).thenReturn(failure())

            await assert.rejects(createClient().listCertificates(input), error)
        })
    })

    describe('listThingCertificates', function () {
        const certificateId = 'cert1'
        const certArn = 'arn:aws:iot:us-west-2:0123456789:cert/cert1'
        const input: ListThingPrincipalsCommandInput = { thingName, maxResults, nextToken }
        const principalsResponse: ListThingPrincipalsCommandOutput = { principals: [certArn], nextToken }

        const describeInput: DescribeCertificateCommandInput = { certificateId }
        const describeResponse: DescribeCertificateCommandOutput = {
            certificateDescription: { certificateId, certificateArn: certArn },
        }

        const expectedResponse: ListThingCertificatesResponse = {
            certificates: [{ certificateId, certificateArn: certArn }],
            nextToken: nextToken,
        }

        it('lists certificates', async function () {
            when(mockIot.listThingPrincipals(deepEqual(input))).thenReturn(success(principalsResponse))
            when(mockIot.describeCertificate(deepEqual(describeInput))).thenReturn(success(describeResponse))

            const response = await createClient().listThingCertificates(input)

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error when certificate listing fails', async function () {
            when(mockIot.listThingPrincipals(anything())).thenReturn(failure())

            await assert.rejects(createClient().listThingCertificates(input), error)
        })

        it('throws an Error when certificate description fails', async function () {
            when(mockIot.listThingPrincipals(deepEqual(input))).thenReturn(success(principalsResponse))
            when(mockIot.describeCertificate(anything())).thenReturn(failure())

            await assert.rejects(createClient().listThingCertificates(input), error)
        })
    })

    describe('listThingsForCert', function () {
        const input: ListPrincipalThingsCommandInput = { principal: 'arn1', maxResults, nextToken }
        const listResponse: ListPrincipalThingsCommandOutput = { things: [thingName], nextToken }
        const expectedResponse = [thingName]

        it('lists things', async function () {
            when(mockIot.listPrincipalThings(deepEqual(input))).thenReturn(success(listResponse))

            const response = await createClient().listThingsForCert(input)

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            when(mockIot.listPrincipalThings(anything())).thenReturn(failure())

            await assert.rejects(createClient().listThingsForCert(input), error)
        })
    })

    describe('listPolicies', function () {
        const input: ListPoliciesCommandInput = { pageSize, marker, ascendingOrder: undefined }
        const expectedResponse: ListPoliciesCommandOutput = { policies: [{ policyName }], nextMarker: marker }

        it('lists policies', async function () {
            when(mockIot.listPolicies(deepEqual(input))).thenReturn(success(expectedResponse))

            const response = await createClient().listPolicies(input)

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            when(mockIot.listPolicies(anything())).thenReturn(failure())

            await assert.rejects(createClient().listPolicies(input), error)
        })
    })

    describe('listPrincipalPolicies', function () {
        const input: ListPrincipalPoliciesCommandInput = {
            pageSize,
            marker,
            ascendingOrder: undefined,
            principal: 'arn1',
        }
        const expectedResponse: ListPoliciesCommandOutput = { policies: [{ policyName }], nextMarker: marker }

        it('lists policies for certificate', async function () {
            when(mockIot.listPrincipalPolicies(deepEqual(input))).thenReturn(success(expectedResponse))

            const response = await createClient().listPrincipalPolicies(input)

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            when(mockIot.listPrincipalPolicies(anything())).thenReturn(failure())

            await assert.rejects(createClient().listPrincipalPolicies(input), error)
        })
    })

    describe('listPolicyTargets', function () {
        const targets = ['arn1', 'arn2']
        const input: ListTargetsForPolicyCommandInput = { policyName, pageSize, marker }
        const listResponse: ListTargetsForPolicyCommandOutput = { targets, nextMarker: marker }

        it('lists certificates', async function () {
            when(mockIot.listTargetsForPolicy(deepEqual(input))).thenReturn(success(listResponse))

            const response = await createClient().listPolicyTargets(input)

            assert.deepStrictEqual(response, targets)
        })

        it('throws an Error on failure', async function () {
            when(mockIot.listTargetsForPolicy(anything())).thenReturn(failure())

            await assert.rejects(createClient().listPolicyTargets(input), error)
        })
    })

    describe('listPolicyVersions', function () {
        const input: ListPolicyVersionsCommandInput = { policyName }
        const expectedVersion1: PolicyVersion = { versionId: '1' }
        const expectedVersion2: PolicyVersion = { versionId: '2' }
        const listResponse: ListPolicyVersionsCommandOutput = { policyVersions: [expectedVersion1, expectedVersion2] }

        it('lists policy versions', async function () {
            when(mockIot.listPolicyVersions(deepEqual(input))).thenReturn(success(listResponse))

            const iterable = createClient().listPolicyVersions(input)
            const responses = []
            for await (const response of iterable) {
                responses.push(response)
            }

            const [firstVersion, secondVersion, ...otherVersions] = responses

            assert.deepStrictEqual(firstVersion, expectedVersion1)
            assert.deepStrictEqual(secondVersion, expectedVersion2)
            assert.deepStrictEqual(otherVersions, [])
        })

        it('throws an Error on iterate failure', async function () {
            when(mockIot.listPolicyVersions(anything())).thenReturn(failure())

            const iterable = createClient().listPolicyVersions(input)
            await assert.rejects(iterable.next(), error)
        })
    })
})
