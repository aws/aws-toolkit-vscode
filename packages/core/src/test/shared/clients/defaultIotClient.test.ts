/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { ServiceException } from '@smithy/smithy-client'
import {
    AttachPolicyCommand,
    AttachPolicyRequest,
    AttachThingPrincipalCommand,
    AttachThingPrincipalRequest,
    CreateKeysAndCertificateCommand,
    CreateKeysAndCertificateRequest,
    CreateKeysAndCertificateResponse,
    CreatePolicyCommand,
    CreatePolicyRequest,
    CreatePolicyResponse,
    CreatePolicyVersionCommand,
    CreatePolicyVersionRequest,
    CreatePolicyVersionResponse,
    CreateThingCommand,
    CreateThingResponse,
    DeleteCertificateCommand,
    DeleteCertificateRequest,
    DeletePolicyCommand,
    DeletePolicyRequest,
    DeletePolicyVersionCommand,
    DeletePolicyVersionRequest,
    DeleteThingCommand,
    DeleteThingRequest,
    DeleteThingResponse,
    DescribeCertificateCommand,
    DescribeCertificateRequest,
    DescribeCertificateResponse,
    DescribeEndpointCommand,
    DescribeEndpointRequest,
    DescribeEndpointResponse,
    DetachPolicyCommand,
    DetachPolicyRequest,
    DetachThingPrincipalCommand,
    DetachThingPrincipalRequest,
    GetPolicyVersionCommand,
    GetPolicyVersionRequest,
    GetPolicyVersionResponse,
    IoTClient,
    IoTClientResolvedConfig,
    ListCertificatesCommand,
    ListCertificatesRequest,
    ListCertificatesResponse,
    ListPoliciesCommand,
    ListPoliciesRequest,
    ListPoliciesResponse,
    ListPolicyVersionsCommand,
    ListPolicyVersionsRequest,
    ListPolicyVersionsResponse,
    ListPrincipalPoliciesCommand,
    ListPrincipalPoliciesRequest,
    ListPrincipalThingsCommand,
    ListPrincipalThingsRequest,
    ListPrincipalThingsResponse,
    ListTargetsForPolicyCommand,
    ListTargetsForPolicyRequest,
    ListTargetsForPolicyResponse,
    ListThingPrincipalsCommand,
    ListThingPrincipalsRequest,
    ListThingPrincipalsResponse,
    ListThingsCommand,
    ListThingsRequest,
    ListThingsResponse,
    PolicyVersion,
    ServiceInputTypes,
    ServiceOutputTypes,
    SetDefaultPolicyVersionCommand,
    SetDefaultPolicyVersionRequest,
    UpdateCertificateCommand,
    UpdateCertificateRequest,
} from '@aws-sdk/client-iot'
import { DefaultIotClient, ListThingCertificatesResponse } from '../../../shared/clients/iotClient'
import { AwsStub, mockClient } from 'aws-sdk-client-mock'

class FakeServiceException extends ServiceException {
    public region: string = 'us-west-2'

    public constructor(message: string) {
        super({
            name: 'FakeServiceException',
            $fault: 'client',
            $metadata: {},
            message,
        })
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
    let mockIot: AwsStub<ServiceInputTypes, ServiceOutputTypes, IoTClientResolvedConfig>

    beforeEach(function () {
        mockIot = mockClient(IoTClient)
    })

    const error: ServiceException = new FakeServiceException('Expected failure') as ServiceException

    function createClient({ regionCode = region }: { regionCode?: string } = {}): DefaultIotClient {
        return new DefaultIotClient(regionCode, () => new IoTClient())
    }

    /* Functions that create or retrieve resources. */

    describe('createThing', function () {
        const expectedResponse: CreateThingResponse = { thingName: thingName, thingArn: 'arn' }
        it('creates a thing', async function () {
            mockIot.on(CreateThingCommand).resolves(expectedResponse)

            const response = await createClient().createThing({ thingName })

            assert.strictEqual(mockIot.commandCalls(CreateThingCommand).length, 1)
            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            mockIot.on(CreateThingCommand).rejects(error)

            await assert.rejects(createClient().createThing({ thingName }), error)
        })
    })

    describe('createCertificateAndKeys', function () {
        const certificateId = 'cert1'
        const input: CreateKeysAndCertificateRequest = { setAsActive: undefined }
        const expectedResponse: CreateKeysAndCertificateResponse = {
            certificateId,
            certificateArn: 'arn',
            certificatePem: 'pem',
            keyPair: { PublicKey: 'publicKey', PrivateKey: 'privateKey' },
        }

        it('creates Certificate and Key Pair', async function () {
            mockIot.on(CreateKeysAndCertificateCommand).resolves(expectedResponse)

            const response = await createClient().createCertificateAndKeys(input)

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            mockIot.on(CreateKeysAndCertificateCommand).rejects(error)

            await assert.rejects(createClient().createCertificateAndKeys(input), error)
        })
    })

    describe('getEndpoint', function () {
        const input: DescribeEndpointRequest = { endpointType: 'iot:Data-ATS' }
        const endpointAddress = 'address'
        const describeResponse: DescribeEndpointResponse = { endpointAddress }

        it('gets endpoint', async function () {
            mockIot.on(DescribeEndpointCommand).resolves(describeResponse)

            const response = await createClient().getEndpoint()

            assert.strictEqual(mockIot.commandCalls(DescribeEndpointCommand).length, 1)
            assert.deepStrictEqual(mockIot.commandCalls(DescribeEndpointCommand)[0].args[0].input, input)
            assert.deepStrictEqual(response, endpointAddress)
        })

        it('throws an Error on failure', async function () {
            mockIot.on(DescribeEndpointCommand).rejects(error)

            await assert.rejects(createClient().getEndpoint(), error)
        })
    })

    describe('getPolicyVersion', function () {
        const input: GetPolicyVersionRequest = { policyName, policyVersionId: '1' }
        const expectedResponse: GetPolicyVersionResponse = {
            policyName,
            policyDocument,
            policyArn: 'arn1',
            policyVersionId: '1',
        }

        it('gets policy document for version', async function () {
            mockIot.on(GetPolicyVersionCommand).resolves(expectedResponse)

            const response = await createClient().getPolicyVersion(input)

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            mockIot.on(GetPolicyVersionCommand).rejects(error)

            await assert.rejects(createClient().getPolicyVersion(input), error)
        })
    })

    /* Functions that return void .*/

    describe('deleteThing', function () {
        const input: DeleteThingRequest = { thingName }

        it('deletes a thing', async function () {
            mockIot.on(DeleteThingCommand).resolves({} as DeleteThingResponse)

            await createClient().deleteThing({ thingName })

            assert.strictEqual(mockIot.commandCalls(DeleteThingCommand).length, 1)
            assert.deepStrictEqual(mockIot.commandCalls(DeleteThingCommand)[0].args[0].input, input)
        })

        it('throws an Error on failure', async function () {
            mockIot.on(DeleteThingCommand).rejects(error)

            await assert.rejects(createClient().deleteThing({ thingName }), error)
        })
    })

    describe('deleteCertificate', function () {
        const certificateId = 'cert1'
        const input: DeleteCertificateRequest = { certificateId, forceDelete: undefined }

        it('deletes a certificate', async function () {
            mockIot.on(DeleteCertificateCommand).resolves({})

            await createClient().deleteCertificate(input)

            assert.strictEqual(mockIot.commandCalls(DeleteCertificateCommand).length, 1)
            assert.deepStrictEqual(mockIot.commandCalls(DeleteCertificateCommand)[0].args[0].input, input)
        })

        it('throws an Error on failure', async function () {
            mockIot.on(DeleteCertificateCommand).rejects(error)

            await assert.rejects(createClient().deleteCertificate(input), error)
        })
    })

    describe('updateCertificate', function () {
        const certificateId = 'cert1'
        const input: UpdateCertificateRequest = { certificateId, newStatus: 'ACTIVE' }

        it('updates a certificate', async function () {
            mockIot.on(UpdateCertificateCommand).resolves({})

            await createClient().updateCertificate(input)

            assert.strictEqual(mockIot.commandCalls(UpdateCertificateCommand).length, 1)
            assert.deepStrictEqual(mockIot.commandCalls(UpdateCertificateCommand)[0].args[0].input, input)
        })

        it('throws an Error on failure', async function () {
            mockIot.on(UpdateCertificateCommand).rejects(error)

            await assert.rejects(createClient().updateCertificate(input), error)
        })
    })

    describe('attachThingPrincipal', function () {
        const input: AttachThingPrincipalRequest = { thingName, principal: 'arn1' }

        it('attaches a certificate to a Thing', async function () {
            mockIot.on(AttachThingPrincipalCommand).resolves({})

            await createClient().attachThingPrincipal(input)

            assert.strictEqual(mockIot.commandCalls(AttachThingPrincipalCommand).length, 1)
            assert.deepStrictEqual(mockIot.commandCalls(AttachThingPrincipalCommand)[0].args[0].input, input)
        })

        it('throws an Error on failure', async function () {
            mockIot.on(AttachThingPrincipalCommand).rejects(error)

            await assert.rejects(createClient().attachThingPrincipal(input), error)
        })
    })

    describe('detachThingPrincipal', function () {
        const input: DetachThingPrincipalRequest = { thingName, principal: 'arn1' }

        it('detaches a certificate from a Thing', async function () {
            mockIot.on(DetachThingPrincipalCommand).resolves({})

            await createClient().detachThingPrincipal(input)

            assert.strictEqual(mockIot.commandCalls(DetachThingPrincipalCommand).length, 1)
            assert.deepStrictEqual(mockIot.commandCalls(DetachThingPrincipalCommand)[0].args[0].input, input)
        })

        it('throws an Error on failure', async function () {
            mockIot.on(DetachThingPrincipalCommand).rejects(error)

            await assert.rejects(createClient().detachThingPrincipal(input), error)
        })
    })

    describe('attachPolicy', function () {
        const input: AttachPolicyRequest = { policyName, target: 'arn1' }

        it('attaches a policy to a certificate', async function () {
            mockIot.on(AttachPolicyCommand).resolves({})

            await createClient().attachPolicy(input)

            assert.strictEqual(mockIot.commandCalls(AttachPolicyCommand).length, 1)
            assert.deepStrictEqual(mockIot.commandCalls(AttachPolicyCommand)[0].args[0].input, input)
        })

        it('throws an Error on failure', async function () {
            mockIot.on(AttachPolicyCommand).rejects(error)

            await assert.rejects(createClient().attachPolicy(input), error)
        })
    })

    describe('detachPolicy', function () {
        const input: DetachPolicyRequest = { policyName, target: 'arn1' }

        it('detaches a policy from a certificate', async function () {
            mockIot.on(DetachPolicyCommand).resolves({})

            await createClient().detachPolicy(input)

            assert.strictEqual(mockIot.commandCalls(DetachPolicyCommand).length, 1)
            assert.deepStrictEqual(mockIot.commandCalls(DetachPolicyCommand)[0].args[0].input, input)
        })

        it('throws an Error on failure', async function () {
            mockIot.on(DetachPolicyCommand).rejects(error)

            await assert.rejects(createClient().detachPolicy(input), error)
        })
    })

    describe('createPolicy', function () {
        const input: CreatePolicyRequest = { policyName, policyDocument }
        const expectedResponse: CreatePolicyResponse = { policyName, policyDocument, policyArn: 'arn1' }

        it('creates a policy from a document', async function () {
            mockIot.on(CreatePolicyCommand).resolves(expectedResponse)

            await createClient().createPolicy(input)

            assert.strictEqual(mockIot.commandCalls(CreatePolicyCommand).length, 1)
            assert.deepStrictEqual(mockIot.commandCalls(CreatePolicyCommand)[0].args[0].input, input)
        })

        it('throws an Error on failure', async function () {
            mockIot.on(CreatePolicyCommand).rejects(error)

            await assert.rejects(createClient().createPolicy(input), error)
        })
    })

    describe('deletePolicy', function () {
        const input: DeletePolicyRequest = { policyName }

        it('deletes a policy', async function () {
            mockIot.on(DeletePolicyCommand).resolves({})

            await createClient().deletePolicy(input)

            assert.strictEqual(mockIot.commandCalls(DeletePolicyCommand).length, 1)
            assert.deepStrictEqual(mockIot.commandCalls(DeletePolicyCommand)[0].args[0].input, input)
        })

        it('throws an Error on failure', async function () {
            mockIot.on(DeletePolicyCommand).rejects(error)

            await assert.rejects(createClient().deletePolicy(input), error)
        })
    })

    describe('createPolicyVersion', function () {
        const input: CreatePolicyVersionRequest = { policyName, policyDocument }
        const expectedResponse: CreatePolicyVersionResponse = { policyDocument, policyArn: 'arn1' }

        it('creates a policy version from a document', async function () {
            mockIot.on(CreatePolicyVersionCommand).resolves(expectedResponse)

            await createClient().createPolicyVersion(input)

            assert.strictEqual(mockIot.commandCalls(CreatePolicyVersionCommand).length, 1)
            assert.deepStrictEqual(mockIot.commandCalls(CreatePolicyVersionCommand)[0].args[0].input, input)
        })

        it('throws an Error on failure', async function () {
            mockIot.on(CreatePolicyVersionCommand).rejects(error)

            await assert.rejects(createClient().createPolicyVersion(input), error)
        })
    })

    describe('deletePolicyVersion', function () {
        const input: DeletePolicyVersionRequest = { policyName, policyVersionId: '1' }

        it('deletes a policy version', async function () {
            mockIot.on(DeletePolicyVersionCommand).resolves({})

            await createClient().deletePolicyVersion(input)

            assert.strictEqual(mockIot.commandCalls(DeletePolicyVersionCommand).length, 1)
            assert.deepStrictEqual(mockIot.commandCalls(DeletePolicyVersionCommand)[0].args[0].input, input)
        })

        it('throws an Error on failure', async function () {
            mockIot.on(DeletePolicyVersionCommand).rejects(error)

            await assert.rejects(createClient().deletePolicyVersion(input), error)
        })
    })

    describe('setDefaultPolicyVersion', function () {
        const input: SetDefaultPolicyVersionRequest = { policyName, policyVersionId: '1' }

        it('deletes a policy version', async function () {
            mockIot.on(SetDefaultPolicyVersionCommand).resolves({})

            await createClient().setDefaultPolicyVersion(input)

            assert.strictEqual(mockIot.commandCalls(SetDefaultPolicyVersionCommand).length, 1)
            assert.deepStrictEqual(mockIot.commandCalls(SetDefaultPolicyVersionCommand)[0].args[0].input, input)
        })

        it('throws an Error on failure', async function () {
            mockIot.on(SetDefaultPolicyVersionCommand).rejects(error)

            await assert.rejects(createClient().setDefaultPolicyVersion(input), error)
        })
    })

    // /* Functions that list resources.

    describe('listThings', function () {
        const input: ListThingsRequest = { maxResults, nextToken }
        const expectedResponse: ListThingsResponse = { things: [{ thingName: 'thing1' }], nextToken }

        it('lists things', async function () {
            mockIot.on(ListThingsCommand).resolves(expectedResponse)

            const response = await createClient().listThings(input)

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            mockIot.on(ListThingsCommand).rejects(error)

            await assert.rejects(createClient().listThings(input), error)
        })
    })

    describe('listCertificates', function () {
        const input: ListCertificatesRequest = { pageSize, marker, ascendingOrder: undefined }
        const expectedResponse: ListCertificatesResponse = {
            certificates: [{ certificateId: 'cert1' }],
            nextMarker: marker,
        }

        it('lists certificates', async function () {
            mockIot.on(ListCertificatesCommand).resolves(expectedResponse)

            const response = await createClient().listCertificates(input)

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            mockIot.on(ListCertificatesCommand).rejects(error)

            await assert.rejects(createClient().listCertificates(input), error)
        })
    })

    describe('listThingCertificates', function () {
        const certificateId = 'cert1'
        const certArn = 'arn:aws:iot:us-west-2:0123456789:cert/cert1'
        const input: ListThingPrincipalsRequest = { thingName, maxResults, nextToken }
        const principalsResponse: ListThingPrincipalsResponse = { principals: [certArn], nextToken }

        const describeInput: DescribeCertificateRequest = { certificateId }
        const describeResponse: DescribeCertificateResponse = {
            certificateDescription: { certificateId, certificateArn: certArn },
        }

        const expectedResponse: ListThingCertificatesResponse = {
            certificates: [{ certificateId, certificateArn: certArn }],
            nextToken: nextToken,
        }

        it('lists certificates', async function () {
            mockIot.on(ListThingPrincipalsCommand).resolves(principalsResponse)
            mockIot.on(DescribeCertificateCommand).resolves(describeResponse)

            const response = await createClient().listThingCertificates(input)

            assert.strictEqual(mockIot.commandCalls(DescribeCertificateCommand).length, 1)
            assert.deepStrictEqual(mockIot.commandCalls(DescribeCertificateCommand)[0].args[0].input, describeInput)
            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error when certificate listing fails', async function () {
            mockIot.on(ListThingPrincipalsCommand).rejects(error)

            await assert.rejects(createClient().listThingCertificates(input), error)
        })

        it('throws an Error when certificate description fails', async function () {
            mockIot.on(ListThingPrincipalsCommand).resolves(principalsResponse)
            mockIot.on(DescribeCertificateCommand).rejects(error)

            await assert.rejects(createClient().listThingCertificates(input), error)
        })
    })

    describe('listThingsForCert', function () {
        const input: ListPrincipalThingsRequest = { principal: 'arn1', maxResults, nextToken }
        const listResponse: ListPrincipalThingsResponse = { things: [thingName], nextToken }
        const expectedResponse = [thingName]

        it('lists things', async function () {
            mockIot.on(ListPrincipalThingsCommand).resolves(listResponse)

            const response = await createClient().listThingsForCert(input)

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            mockIot.on(ListPrincipalThingsCommand).rejects(error)

            await assert.rejects(createClient().listThingsForCert(input), error)
        })
    })

    describe('listPolicies', function () {
        const input: ListPoliciesRequest = { pageSize, marker, ascendingOrder: undefined }
        const expectedResponse: ListPoliciesResponse = { policies: [{ policyName }], nextMarker: marker }

        it('lists policies', async function () {
            mockIot.on(ListPoliciesCommand).resolves(expectedResponse)

            const response = await createClient().listPolicies(input)

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            mockIot.on(ListPoliciesCommand).rejects(error)

            await assert.rejects(createClient().listPolicies(input), error)
        })
    })

    describe('listPrincipalPolicies', function () {
        const input: ListPrincipalPoliciesRequest = {
            pageSize,
            marker,
            ascendingOrder: undefined,
            principal: 'arn1',
        }
        const expectedResponse: ListPoliciesResponse = { policies: [{ policyName }], nextMarker: marker }

        it('lists policies for certificate', async function () {
            mockIot.on(ListPrincipalPoliciesCommand).resolves(expectedResponse)

            const response = await createClient().listPrincipalPolicies(input)

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            mockIot.on(ListPrincipalPoliciesCommand).rejects(error)

            await assert.rejects(createClient().listPrincipalPolicies(input), error)
        })
    })

    describe('listPolicyTargets', function () {
        const targets = ['arn1', 'arn2']
        const input: ListTargetsForPolicyRequest = { policyName, pageSize, marker }
        const listResponse: ListTargetsForPolicyResponse = { targets, nextMarker: marker }

        it('lists certificates', async function () {
            mockIot.on(ListTargetsForPolicyCommand).resolves(listResponse)

            const response = await createClient().listPolicyTargets(input)

            assert.deepStrictEqual(response, targets)
        })

        it('throws an Error on failure', async function () {
            mockIot.on(ListTargetsForPolicyCommand).rejects(error)

            await assert.rejects(createClient().listPolicyTargets(input), error)
        })
    })

    describe('listPolicyVersions', function () {
        const input: ListPolicyVersionsRequest = { policyName }
        const expectedVersion1: PolicyVersion = { versionId: '1' }
        const expectedVersion2: PolicyVersion = { versionId: '2' }
        const listResponse: ListPolicyVersionsResponse = { policyVersions: [expectedVersion1, expectedVersion2] }

        it('lists policy versions', async function () {
            mockIot.on(ListPolicyVersionsCommand).resolves(listResponse)

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
            mockIot.on(ListPolicyVersionsCommand).rejects(error)

            const iterable = createClient().listPolicyVersions(input)
            await assert.rejects(iterable.next(), error)
        })
    })
})
