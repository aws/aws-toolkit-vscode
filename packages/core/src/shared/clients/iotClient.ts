/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import { Iot } from 'aws-sdk'
import { parse } from '@aws-sdk/util-arn-parser'
import { getLogger } from '../logger'
import { InterfaceNoSymbol } from '../utilities/tsUtils'
import globals from '../extensionGlobals'

const defaultMaxThings = 250 // 250 is the maximum allowed by the API

/* ATS is recommended over the deprecated Verisign certificates */
const iotEndpointType = 'iot:Data-ATS'

export type IotThing = { readonly name: string; readonly arn: string }
export type IotCertificate = {
    readonly id: string
    readonly arn: string
    readonly activeStatus: string
    readonly creationDate: Date
}
export type IotPolicy = IotThing
export type IotClient = InterfaceNoSymbol<DefaultIotClient>

const iotServiceArn = 'iot'
// Pattern to extract the certificate ID from the parsed ARN resource.
const certArnResourcePattern = /cert\/(\w+)/

export interface ListThingCertificatesResponse {
    readonly certificates: Iot.CertificateDescription[]
    readonly nextToken: string | undefined
}

export class DefaultIotClient {
    public constructor(
        private readonly regionCode: string,
        private readonly iotProvider: (regionCode: string) => Promise<Iot> = createSdkClient
    ) {}

    /**
     * Lists Things owned by the client.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listThings(request?: Iot.ListThingsRequest): Promise<Iot.ListThingsResponse> {
        getLogger().debug('ListThings called with request: %O', request)
        const iot = await this.iotProvider(this.regionCode)

        const output: Iot.ListThingsResponse = await iot
            .listThings({
                maxResults: request?.maxResults ?? defaultMaxThings,
                nextToken: request?.nextToken,
            })
            .promise()

        getLogger().debug('ListThings returned response: %O', output)
        return output
    }

    /**
     * Creates an IoT Thing.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async createThing(request: Iot.CreateThingRequest): Promise<Iot.CreateThingResponse> {
        getLogger().debug('CreateThing called with request: %O', request)
        const iot = await this.iotProvider(this.regionCode)

        const output: Iot.CreateThingResponse = await iot.createThing({ thingName: request.thingName }).promise()

        getLogger().debug('CreateThing returned response: %O', output)
        return output
    }

    /**
     * Deletes an IoT Thing.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async deleteThing(request: Iot.DeleteThingRequest): Promise<void> {
        getLogger().debug('DeleteThing called with request: %O', request)
        const iot = await this.iotProvider(this.regionCode)

        await iot.deleteThing({ thingName: request.thingName }).promise()

        getLogger().debug('DeleteThing successful')
    }

    /**
     * Lists all IoT certificates in account.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listCertificates(request: Iot.ListCertificatesRequest): Promise<Iot.ListCertificatesResponse> {
        getLogger().debug('ListCertificates called with request: %O', request)
        const iot = await this.iotProvider(this.regionCode)

        const output: Iot.ListCertificatesResponse = await iot
            .listCertificates({
                pageSize: request.pageSize ?? defaultMaxThings,
                marker: request.marker,
                ascendingOrder: request.ascendingOrder,
            })
            .promise()

        getLogger().debug('ListCertificates returned response: %O', output)
        return output
    }

    /**
     * Lists all principals attached to IoT Thing.
     *
     * Returns ARNS of principals that may be X.509 certificates, IAM
     * users/groups/roles, or Amazon Cognito identities.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listThingPrincipals(
        request: Iot.ListThingPrincipalsRequest
    ): Promise<Iot.ListThingPrincipalsResponse> {
        const iot = await this.iotProvider(this.regionCode)

        const output: Iot.ListThingPrincipalsResponse = await iot
            .listThingPrincipals({
                thingName: request.thingName,
                maxResults: request.maxResults ?? defaultMaxThings,
                nextToken: request.nextToken,
            })
            .promise()
        return output
    }

    /**
     * Describes a certificate given the certificate ID.
     *
     * @throws Error if there is an error calling IoT.
     */
    private async describeCertificate(
        request: Iot.DescribeCertificateRequest
    ): Promise<Iot.DescribeCertificateResponse> {
        const iot = await this.iotProvider(this.regionCode)

        const output: Iot.DescribeCertificateResponse = await iot.describeCertificate(request).promise()

        return output
    }

    /**
     * Lists all IoT certificates attached to IoT Thing.
     *
     * listThingPrincipals() returns ARNS of principals that may be X.509
     * certificates, IAM users/groups/roles, or Amazon Cognito identities.
     * The list is filtered for certificates only, and describeCertificate()
     * is called to get the information for each certificate.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listThingCertificates(
        request: Iot.ListThingPrincipalsRequest
    ): Promise<ListThingCertificatesResponse> {
        getLogger().debug('ListThingCertificates called with request: %O', request)

        const output = await this.listThingPrincipals(request)
        const iotPrincipals: Iot.Principal[] = output.principals ?? []
        const nextToken = output.nextToken

        const describedCerts = iotPrincipals.map(async (iotPrincipal) => {
            const principalArn = parse(iotPrincipal)
            const certIdFound = principalArn.resource.match(certArnResourcePattern)
            if (principalArn.service !== iotServiceArn || !certIdFound) {
                return undefined
            }
            const certId = certIdFound[1]
            return this.describeCertificate({ certificateId: certId })
        })

        const resolvedCerts = (await Promise.all(describedCerts))
            .filter((cert) => cert?.certificateDescription !== undefined)
            .map((cert) => cert?.certificateDescription as Iot.CertificateDescription)

        const response: ListThingCertificatesResponse = { certificates: resolvedCerts, nextToken: nextToken }
        getLogger().debug('ListThingCertificates returned response: %O', response)
        return { certificates: resolvedCerts, nextToken: nextToken }
    }

    /**
     * Lists Things attached to specified certificate.
     *
     * The nextToken output is discarded, since this function is only used
     * to determine if the number of attached Things is nonzero.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listThingsForCert(request: Iot.ListPrincipalThingsRequest): Promise<string[]> {
        getLogger().debug('ListThingsForCert called with request: %O', request)
        const iot = await this.iotProvider(this.regionCode)

        const output = await iot
            .listPrincipalThings({
                maxResults: request.maxResults ?? defaultMaxThings,
                nextToken: request.nextToken,
                principal: request.principal,
            })
            .promise()
        const iotThings: Iot.ThingName[] = output.things ?? []

        getLogger().debug('ListThingsForCert returned response: %O', iotThings)
        return iotThings
    }

    /**
     * Creates an X.509 certificate with a 2048 bit RSA keypair.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async createCertificateAndKeys(
        request: Iot.CreateKeysAndCertificateRequest
    ): Promise<Iot.CreateKeysAndCertificateResponse> {
        getLogger().debug('CreateCertificate called with request: %O', request)
        const iot = await this.iotProvider(this.regionCode)

        const output: Iot.CreateKeysAndCertificateResponse = await iot.createKeysAndCertificate(request).promise()

        getLogger().debug('CreateCertificate succeeded')
        return output
    }

    /**
     * Activates, deactivates, or revokes an IoT Certificate.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async updateCertificate(request: Iot.UpdateCertificateRequest): Promise<void> {
        getLogger().debug('UpdateCertificate called with request: %O', request)
        const iot = await this.iotProvider(this.regionCode)

        await iot.updateCertificate({ certificateId: request.certificateId, newStatus: request.newStatus }).promise()

        getLogger().debug('UpdateCertificate successful')
    }

    /**
     * Deletes the specified IoT Certificate.
     *
     * Note that a certificate cannot be deleted if it is ACTIVE, or has attached
     * Things or policies. A certificate may be force deleted if it is INACTIVE
     * and has no attached Things.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async deleteCertificate(request: Iot.DeleteCertificateRequest): Promise<void> {
        getLogger().debug('DeleteCertificate called with request: %O', request)
        const iot = await this.iotProvider(this.regionCode)

        await iot.deleteCertificate(request).promise()

        getLogger().debug('DeleteCertificate successful')
    }

    /**
     * Attaches the certificate specified by the principal to the specified Thing.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async attachThingPrincipal(request: Iot.AttachThingPrincipalRequest): Promise<void> {
        getLogger().debug('AttachThingPrincipal called with request: %O', request)
        const iot = await this.iotProvider(this.regionCode)

        await iot.attachThingPrincipal({ thingName: request.thingName, principal: request.principal }).promise()

        getLogger().debug('AttachThingPrincipal successful')
    }

    /**
     * Detaches the certificate specified by the principal from the specified Thing.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async detachThingPrincipal(request: Iot.DetachThingPrincipalRequest): Promise<void> {
        getLogger().debug('DetachThingPrincipal called with request: %O', request)
        const iot = await this.iotProvider(this.regionCode)

        await iot.detachThingPrincipal({ thingName: request.thingName, principal: request.principal }).promise()

        getLogger().debug('DetachThingPrincipal successful')
    }

    /**
     * Lists all IoT Policies.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listPolicies(request: Iot.ListPoliciesRequest): Promise<Iot.ListPoliciesResponse> {
        getLogger().debug('ListPolicies called with request: %O', request)
        const iot = await this.iotProvider(this.regionCode)

        const output: Iot.ListPoliciesResponse = await iot
            .listPolicies({
                pageSize: request.pageSize ?? defaultMaxThings,
                marker: request.marker,
                ascendingOrder: request.ascendingOrder,
            })
            .promise()

        getLogger().debug('ListPolicies returned response: %O', output)
        return output
    }

    /**
     * Lists IoT policies for principal.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listPrincipalPolicies(request: Iot.ListPrincipalPoliciesRequest): Promise<Iot.ListPoliciesResponse> {
        getLogger().debug('ListPrincipalPolicies called with request: %O', request)
        const iot = await this.iotProvider(this.regionCode)

        const output: Iot.ListPrincipalPoliciesResponse = await iot
            .listPrincipalPolicies({
                principal: request.principal,
                pageSize: request.pageSize ?? defaultMaxThings,
                marker: request.marker,
                ascendingOrder: request.ascendingOrder,
            })
            .promise()

        getLogger().debug('ListPrincipalPolicies returned response: %O', output)
        return output
    }

    /**
     * Lists certificates attached to specified policy.
     *
     * The nextMarker output value is discarded, since this function is only
     * used to determine if the number of attached targets is nonzero.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listPolicyTargets(request: Iot.ListTargetsForPolicyRequest): Promise<string[]> {
        getLogger().debug('ListPolicyTargets called with request: %O', request)
        const iot = await this.iotProvider(this.regionCode)

        const output = await iot
            .listTargetsForPolicy({
                pageSize: request.pageSize ?? defaultMaxThings,
                marker: request.marker,
                policyName: request.policyName,
            })
            .promise()
        const arns: Iot.Target[] = output.targets ?? []

        getLogger().debug('ListPolicyTargets returned response: %O', arns)
        return arns
    }

    /**
     * Attaches the specified policy to the specified target certificate.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async attachPolicy(request: Iot.AttachPolicyRequest): Promise<void> {
        getLogger().debug('AttachPolicy called with request: %O', request)
        const iot = await this.iotProvider(this.regionCode)

        await iot.attachPolicy({ policyName: request.policyName, target: request.target }).promise()

        getLogger().debug('AttachPolicy successful')
    }

    /**
     * Detaches the specified policy to the specified target certificate.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async detachPolicy(request: Iot.DetachPolicyRequest): Promise<void> {
        getLogger().debug('DetachPolicy called with request: %O', request)
        const iot = await this.iotProvider(this.regionCode)

        await iot.detachPolicy({ policyName: request.policyName, target: request.target }).promise()

        getLogger().debug('DetachPolicy successful')
    }

    /**
     * Creates an policy from the given policy document.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async createPolicy(request: Iot.CreatePolicyRequest): Promise<void> {
        getLogger().debug('CreatePolicy called with request: %O', request)
        const iot = await this.iotProvider(this.regionCode)

        const output: Iot.CreatePolicyResponse = await iot.createPolicy(request).promise()
        getLogger().info(`Created policy: ${output.policyArn}`)

        getLogger().debug('CreatePolicy successful')
    }

    /**
     * Deletes an IoT Policy.
     *
     * Note that a policy cannot be deleted if it is attached to a certificate,
     * or has non-default versions. A policy with non default versions must first
     * delete versions with deletePolicyVersions()
     *
     * @throws Error if there is an error calling IoT.
     */
    public async deletePolicy(request: Iot.DeletePolicyRequest): Promise<void> {
        getLogger().debug('DeletePolicy called with request: %O', request)
        const iot = await this.iotProvider(this.regionCode)

        await iot.deletePolicy({ policyName: request.policyName }).promise()

        getLogger().debug('DeletePolicy successful')
    }

    /**
     * Retrieves the account's IoT device data endpoint.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async getEndpoint(): Promise<string> {
        getLogger().debug('GetEndpoint called')
        const iot = await this.iotProvider(this.regionCode)

        const output = await iot.describeEndpoint({ endpointType: iotEndpointType }).promise()
        if (!output.endpointAddress) {
            throw new Error('Failed to retrieve endpoint')
        }

        getLogger().debug('GetEndpoint successful')
        return output.endpointAddress
    }

    /**
     * Lists versions for an IoT Policy
     *
     * @throws Error if there is an error calling IoT.
     */
    public async *listPolicyVersions(request: Iot.ListPolicyVersionsRequest): AsyncIterableIterator<Iot.PolicyVersion> {
        const iot = await this.iotProvider(this.regionCode)

        const response = await iot.listPolicyVersions(request).promise()

        if (response.policyVersions) {
            yield* response.policyVersions
        }
    }

    /**
     * Creates a new version for an IoT policy
     *
     * @throws Error if there is an error calling IoT.
     */
    public async createPolicyVersion(request: Iot.CreatePolicyVersionRequest): Promise<void> {
        getLogger().debug('CreatePolicyVersion called with request: %O', request)
        const iot = await this.iotProvider(this.regionCode)

        const output = await iot.createPolicyVersion(request).promise()
        getLogger().info(`Created new version ${output.policyVersionId} of ${request.policyName}`)

        getLogger().debug('CreatePolicyVersion successful')
    }

    /**
     * Deletes an IoT Policy version.
     *
     * Note that a policy cannot be deleted if it is attached to a certificate,
     * or has non-default versions. A policy with non default versions must first
     * delete versions with deletePolicyVersions()
     *
     * @throws Error if there is an error calling IoT.
     */
    public async deletePolicyVersion(request: Iot.DeletePolicyVersionRequest): Promise<void> {
        getLogger().debug('DeletePolicyVersion called with request: %O', request)
        const iot = await this.iotProvider(this.regionCode)

        await iot.deletePolicyVersion(request).promise()

        getLogger().debug('DeletePolicyVersion successful')
    }

    /**
     * Sets a default version for an Iot Policy.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async setDefaultPolicyVersion(request: Iot.SetDefaultPolicyVersionRequest): Promise<void> {
        getLogger().debug('SetDefaultPolicyVersion called with request: %O', request)
        const iot = await this.iotProvider(this.regionCode)

        await iot.setDefaultPolicyVersion(request).promise()

        getLogger().debug('SetDefaultPolicyVersion successful')
    }

    /**
     * Downloads information including document for a specified policy version.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async getPolicyVersion(request: Iot.GetPolicyVersionRequest): Promise<Iot.GetPolicyVersionResponse> {
        getLogger().debug('GetPolicyVersion called with request: %O', request)
        const iot = await this.iotProvider(this.regionCode)

        const output: Iot.GetPolicyVersionResponse = await iot.getPolicyVersion(request).promise()

        getLogger().debug('GetPolicyVersion successful')
        return output
    }
}

async function createSdkClient(regionCode: string): Promise<Iot> {
    return await globals.sdkClientBuilder.createAwsService(Iot, undefined, regionCode)
}
