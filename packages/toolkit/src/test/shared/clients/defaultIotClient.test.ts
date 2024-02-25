/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { AWSError, Request, Iot, Endpoint, Config } from 'aws-sdk'
import { DefaultIotClient, ListThingCertificatesResponse } from '../../../shared/clients/iotClient'
import { Stub, stub } from '../../utilities/stubber'
import sinon from 'sinon'

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
    let mockIot: Stub<Iot>

    beforeEach(function () {
        mockIot = stub(Iot, {
            config: stub(Config),
            apiVersions: [],
            endpoint: stub(Endpoint, {
                host: '',
                hostname: '',
                href: '',
                port: 0,
                protocol: '',
            }),
        })
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
        return new DefaultIotClient(regionCode, () => Promise.resolve(mockIot))
    }

    /* Functions that create or retrieve resources. */

    describe('createThing', function () {
        const expectedResponse: Iot.CreateThingResponse = { thingName: thingName, thingArn: 'arn' }
        it('creates a thing', async function () {
            mockIot.createThing.returns(success(expectedResponse))

            const response = await createClient().createThing({ thingName })

            assert(mockIot.createThing.calledOnceWithExactly)
            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            mockIot.createThing.returns(failure())

            await assert.rejects(createClient().createThing({ thingName }), error)
        })
    })

    describe('createCertificateAndKeys', function () {
        const certificateId = 'cert1'
        const input: Iot.CreateKeysAndCertificateRequest = { setAsActive: undefined }
        const expectedResponse: Iot.CreateKeysAndCertificateResponse = {
            certificateId,
            certificateArn: 'arn',
            certificatePem: 'pem',
            keyPair: { PublicKey: 'publicKey', PrivateKey: 'privateKey' },
        }

        it('creates Certificate and Key Pair', async function () {
            mockIot.createKeysAndCertificate.returns(success(expectedResponse))

            const response = await createClient().createCertificateAndKeys(input)

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            mockIot.createKeysAndCertificate.returns(failure())

            await assert.rejects(createClient().createCertificateAndKeys(input), error)
        })
    })

    describe('getEndpoint', function () {
        const input: Iot.DescribeEndpointRequest = { endpointType: 'iot:Data-ATS' }
        const endpointAddress = 'address'
        const describeResponse: Iot.DescribeEndpointResponse = { endpointAddress }

        it('gets endpoint', async function () {
            mockIot.describeEndpoint.returns(success(describeResponse))

            const response = await createClient().getEndpoint()

            mockIot.describeEndpoint.calledOnceWithExactly(sinon.match(input))
            assert.deepStrictEqual(response, endpointAddress)
        })

        it('throws an Error on failure', async function () {
            mockIot.describeEndpoint.returns(failure())

            await assert.rejects(createClient().getEndpoint(), error)
        })
    })

    describe('getPolicyVersion', function () {
        const input: Iot.GetPolicyVersionRequest = { policyName, policyVersionId: '1' }
        const expectedResponse: Iot.GetPolicyVersionResponse = {
            policyName,
            policyDocument,
            policyArn: 'arn1',
            policyVersionId: '1',
        }

        it('gets policy document for version', async function () {
            mockIot.getPolicyVersion.returns(success(expectedResponse))

            const response = await createClient().getPolicyVersion(input)

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            mockIot.getPolicyVersion.returns(failure())

            await assert.rejects(createClient().getPolicyVersion(input), error)
        })
    })

    /* Functions that return void .*/

    describe('deleteThing', function () {
        const input: Iot.DeleteThingRequest = { thingName }

        it('deletes a thing', async function () {
            mockIot.deleteThing.returns(success({} as Iot.DeleteThingResponse))

            await createClient().deleteThing({ thingName })

            assert(mockIot.deleteThing.calledOnceWithExactly(sinon.match(input)))
        })

        it('throws an Error on failure', async function () {
            mockIot.deleteThing.returns(failure())

            await assert.rejects(createClient().deleteThing({ thingName }), error)
        })
    })

    describe('deleteCertificate', function () {
        const certificateId = 'cert1'
        const input: Iot.DeleteCertificateRequest = { certificateId, forceDelete: undefined }

        it('deletes a certificate', async function () {
            mockIot.deleteCertificate.returns(success())

            await createClient().deleteCertificate(input)

            assert(mockIot.deleteCertificate.calledOnceWithExactly(sinon.match(input)))
        })

        it('throws an Error on failure', async function () {
            mockIot.deleteCertificate.returns(failure())

            await assert.rejects(createClient().deleteCertificate(input), error)
        })
    })

    describe('updateCertificate', function () {
        const certificateId = 'cert1'
        const input: Iot.UpdateCertificateRequest = { certificateId, newStatus: 'ACTIVE' }

        it('updates a certificate', async function () {
            mockIot.updateCertificate.returns(success())

            await createClient().updateCertificate(input)

            assert(mockIot.updateCertificate.calledOnceWithExactly(sinon.match(input)))
        })

        it('throws an Error on failure', async function () {
            mockIot.updateCertificate.returns(failure())

            await assert.rejects(createClient().updateCertificate(input), error)
        })
    })

    describe('attachThingPrincipal', function () {
        const input: Iot.AttachThingPrincipalRequest = { thingName, principal: 'arn1' }

        it('attaches a certificate to a Thing', async function () {
            mockIot.attachThingPrincipal.returns(success())

            await createClient().attachThingPrincipal(input)

            assert(mockIot.attachThingPrincipal.calledOnceWithExactly(sinon.match(input)))
        })

        it('throws an Error on failure', async function () {
            mockIot.attachThingPrincipal.returns(failure())

            await assert.rejects(createClient().attachThingPrincipal(input), error)
        })
    })

    describe('detachThingPrincipal', function () {
        const input: Iot.DetachThingPrincipalRequest = { thingName, principal: 'arn1' }

        it('detaches a certificate from a Thing', async function () {
            mockIot.detachThingPrincipal.returns(success())

            await createClient().detachThingPrincipal(input)

            assert(mockIot.detachThingPrincipal.calledOnceWithExactly(sinon.match(input)))
        })

        it('throws an Error on failure', async function () {
            mockIot.detachThingPrincipal.returns(failure())

            await assert.rejects(createClient().detachThingPrincipal(input), error)
        })
    })

    describe('attachPolicy', function () {
        const input: Iot.AttachPolicyRequest = { policyName, target: 'arn1' }

        it('attaches a policy to a certificate', async function () {
            mockIot.attachPolicy.returns(success())

            await createClient().attachPolicy(input)

            assert(mockIot.attachPolicy.calledOnceWithExactly(sinon.match(input)))
        })

        it('throws an Error on failure', async function () {
            mockIot.attachPolicy.returns(failure())

            await assert.rejects(createClient().attachPolicy(input), error)
        })
    })

    describe('detachPolicy', function () {
        const input: Iot.DetachPolicyRequest = { policyName, target: 'arn1' }

        it('detaches a policy from a certificate', async function () {
            mockIot.detachPolicy.returns(success())

            await createClient().detachPolicy(input)

            assert(mockIot.detachPolicy.calledOnceWithExactly(sinon.match(input)))
        })

        it('throws an Error on failure', async function () {
            mockIot.detachPolicy.returns(failure())

            await assert.rejects(createClient().detachPolicy(input), error)
        })
    })

    describe('createPolicy', function () {
        const input: Iot.CreatePolicyRequest = { policyName, policyDocument }
        const expectedResponse: Iot.CreatePolicyResponse = { policyName, policyDocument, policyArn: 'arn1' }

        it('creates a policy from a document', async function () {
            mockIot.createPolicy.returns(success(expectedResponse))

            await createClient().createPolicy(input)

            assert(mockIot.createPolicy.calledOnceWithExactly(sinon.match(input)))
        })

        it('throws an Error on failure', async function () {
            mockIot.createPolicy.returns(failure())

            await assert.rejects(createClient().createPolicy(input), error)
        })
    })

    describe('deletePolicy', function () {
        const input: Iot.DeletePolicyRequest = { policyName }

        it('deletes a policy', async function () {
            mockIot.deletePolicy.returns(success())

            await createClient().deletePolicy(input)

            assert(mockIot.deletePolicy.calledOnceWithExactly(sinon.match(input)))
        })

        it('throws an Error on failure', async function () {
            mockIot.deletePolicy.returns(failure())

            await assert.rejects(createClient().deletePolicy(input), error)
        })
    })

    describe('createPolicyVersion', function () {
        const input: Iot.CreatePolicyVersionRequest = { policyName, policyDocument }
        const expectedResponse: Iot.CreatePolicyVersionResponse = { policyDocument, policyArn: 'arn1' }

        it('creates a policy version from a document', async function () {
            mockIot.createPolicyVersion.returns(success(expectedResponse))

            await createClient().createPolicyVersion(input)

            assert(mockIot.createPolicyVersion.calledOnceWithExactly(sinon.match(input)))
        })

        it('throws an Error on failure', async function () {
            mockIot.createPolicyVersion.returns(failure())

            await assert.rejects(createClient().createPolicyVersion(input), error)
        })
    })

    describe('deletePolicyVersion', function () {
        const input: Iot.DeletePolicyVersionRequest = { policyName, policyVersionId: '1' }

        it('deletes a policy version', async function () {
            mockIot.deletePolicyVersion.returns(success())

            await createClient().deletePolicyVersion(input)

            assert(mockIot.deletePolicyVersion.calledOnceWithExactly(sinon.match(input)))
        })

        it('throws an Error on failure', async function () {
            mockIot.deletePolicyVersion.returns(failure())

            await assert.rejects(createClient().deletePolicyVersion(input), error)
        })
    })

    describe('setDefaultPolicyVersion', function () {
        const input: Iot.SetDefaultPolicyVersionRequest = { policyName, policyVersionId: '1' }

        it('deletes a policy version', async function () {
            mockIot.setDefaultPolicyVersion.returns(success())

            await createClient().setDefaultPolicyVersion(input)

            assert(mockIot.setDefaultPolicyVersion.calledOnceWithExactly(sinon.match(input)))
        })

        it('throws an Error on failure', async function () {
            mockIot.setDefaultPolicyVersion.returns(failure())

            await assert.rejects(createClient().setDefaultPolicyVersion(input), error)
        })
    })

    // /* Functions that list resources.

    describe('listThings', function () {
        const input: Iot.ListThingsRequest = { maxResults, nextToken }
        const expectedResponse: Iot.ListThingsResponse = { things: [{ thingName: 'thing1' }], nextToken }

        it('lists things', async function () {
            mockIot.listThings.returns(success(expectedResponse))

            const response = await createClient().listThings(input)

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            mockIot.listThings.returns(failure())

            await assert.rejects(createClient().listThings(input), error)
        })
    })

    describe('listCertificates', function () {
        const input: Iot.ListCertificatesRequest = { pageSize, marker, ascendingOrder: undefined }
        const expectedResponse: Iot.ListCertificatesResponse = {
            certificates: [{ certificateId: 'cert1' }],
            nextMarker: marker,
        }

        it('lists certificates', async function () {
            mockIot.listCertificates.returns(success(expectedResponse))

            const response = await createClient().listCertificates(input)

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            mockIot.listCertificates.returns(failure())

            await assert.rejects(createClient().listCertificates(input), error)
        })
    })

    describe('listThingCertificates', function () {
        const certificateId = 'cert1'
        const certArn = 'arn:aws:iot:us-west-2:0123456789:cert/cert1'
        const input: Iot.ListThingPrincipalsRequest = { thingName, maxResults, nextToken }
        const principalsResponse: Iot.ListThingPrincipalsResponse = { principals: [certArn], nextToken }

        const describeInput: Iot.DescribeCertificateRequest = { certificateId }
        const describeResponse: Iot.DescribeCertificateResponse = {
            certificateDescription: { certificateId, certificateArn: certArn },
        }

        const expectedResponse: ListThingCertificatesResponse = {
            certificates: [{ certificateId, certificateArn: certArn }],
            nextToken: nextToken,
        }

        it('lists certificates', async function () {
            mockIot.listThingPrincipals.returns(success(principalsResponse))
            mockIot.describeCertificate.returns(success(describeResponse))

            const response = await createClient().listThingCertificates(input)

            mockIot.describeCertificate.calledOnceWithExactly(sinon.match(describeInput))
            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error when certificate listing fails', async function () {
            mockIot.listThingPrincipals.returns(failure())

            await assert.rejects(createClient().listThingCertificates(input), error)
        })

        it('throws an Error when certificate description fails', async function () {
            mockIot.listThingPrincipals.returns(success(principalsResponse))
            mockIot.describeCertificate.returns(failure())

            await assert.rejects(createClient().listThingCertificates(input), error)
        })
    })

    describe('listThingsForCert', function () {
        const input: Iot.ListPrincipalThingsRequest = { principal: 'arn1', maxResults, nextToken }
        const listResponse: Iot.ListPrincipalThingsResponse = { things: [thingName], nextToken }
        const expectedResponse = [thingName]

        it('lists things', async function () {
            mockIot.listPrincipalThings.returns(success(listResponse))

            const response = await createClient().listThingsForCert(input)

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            mockIot.listPrincipalThings.returns(failure())

            await assert.rejects(createClient().listThingsForCert(input), error)
        })
    })

    describe('listPolicies', function () {
        const input: Iot.ListPoliciesRequest = { pageSize, marker, ascendingOrder: undefined }
        const expectedResponse: Iot.ListPoliciesResponse = { policies: [{ policyName }], nextMarker: marker }

        it('lists policies', async function () {
            mockIot.listPolicies.returns(success(expectedResponse))

            const response = await createClient().listPolicies(input)

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            mockIot.listPolicies.returns(failure())

            await assert.rejects(createClient().listPolicies(input), error)
        })
    })

    describe('listPrincipalPolicies', function () {
        const input: Iot.ListPrincipalPoliciesRequest = {
            pageSize,
            marker,
            ascendingOrder: undefined,
            principal: 'arn1',
        }
        const expectedResponse: Iot.ListPoliciesResponse = { policies: [{ policyName }], nextMarker: marker }

        it('lists policies for certificate', async function () {
            mockIot.listPrincipalPolicies.returns(success(expectedResponse))

            const response = await createClient().listPrincipalPolicies(input)

            assert.deepStrictEqual(response, expectedResponse)
        })

        it('throws an Error on failure', async function () {
            mockIot.listPrincipalPolicies.returns(failure())

            await assert.rejects(createClient().listPrincipalPolicies(input), error)
        })
    })

    describe('listPolicyTargets', function () {
        const targets = ['arn1', 'arn2']
        const input: Iot.ListTargetsForPolicyRequest = { policyName, pageSize, marker }
        const listResponse: Iot.ListTargetsForPolicyResponse = { targets, nextMarker: marker }

        it('lists certificates', async function () {
            mockIot.listTargetsForPolicy.returns(success(listResponse))

            const response = await createClient().listPolicyTargets(input)

            assert.deepStrictEqual(response, targets)
        })

        it('throws an Error on failure', async function () {
            mockIot.listTargetsForPolicy.returns(failure())

            await assert.rejects(createClient().listPolicyTargets(input), error)
        })
    })

    describe('listPolicyVersions', function () {
        const input: Iot.ListPolicyVersionsRequest = { policyName }
        const expectedVersion1: Iot.PolicyVersion = { versionId: '1' }
        const expectedVersion2: Iot.PolicyVersion = { versionId: '2' }
        const listResponse: Iot.ListPolicyVersionsResponse = { policyVersions: [expectedVersion1, expectedVersion2] }

        it('lists policy versions', async function () {
            mockIot.listPolicyVersions.returns(success(listResponse))

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
            mockIot.listPolicyVersions.returns(failure())

            const iterable = createClient().listPolicyVersions(input)
            await assert.rejects(iterable.next(), error)
        })
    })
})
