/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import { Iot } from 'aws-sdk'
import { ext } from '../extensionGlobals'
import { getLogger } from '../logger'
import { InterfaceNoSymbol } from '../utilities/tsUtils'

export const DEFAULT_MAX_THINGS = 250 // 250 is the maximum allowed by the API
export const DEFAULT_DELIMITER = '/'

/* ATS is recommended over the deprecated Verisign certificates */
const IOT_ENDPOINT_TYPE = 'iot:Data-ATS'

export type IotThing = InterfaceNoSymbol<DefaultIotThing>
export type IotCertificate = InterfaceNoSymbol<DefaultIotCertificate>
export type IotPolicy = InterfaceNoSymbol<DefaultIotPolicy>
export type IotClient = InterfaceNoSymbol<DefaultIotClient>

//ARN Pattern for certificates. FIXME import @aws-sdk/util-arn-parser instead.
const CERT_ARN_PATTERN = /arn:aws:iot:\S+?:\d+:cert\/(\w+)/

export interface ListThingCertificatesResponse {
    readonly certificates: Iot.CertificateDescription[]
    readonly nextToken: string | undefined
}

export class DefaultIotClient {
    public constructor(
        private readonly regionCode: string,
        private readonly iotProvider: (regionCode: string) => Promise<Iot> = createSdkClient
    ) {}

    private async createIot(): Promise<Iot> {
        return this.iotProvider(this.regionCode)
    }

    /**
     * Lists Things owned by the client.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listThings(request?: Iot.ListThingsRequest): Promise<Iot.ListThingsResponse> {
        getLogger().debug('ListThings called with request: %O', request)
        const iot = await this.createIot()

        let output: Iot.ListThingsResponse
        try {
            output = await iot
                .listThings({
                    maxResults: request?.maxResults ?? DEFAULT_MAX_THINGS,
                    nextToken: request?.nextToken,
                })
                .promise()
        } catch (e) {
            getLogger().error('Failed to list things: %O', e)
            throw e
        }

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
        const iot = await this.createIot()

        let output: Iot.CreateThingResponse
        try {
            output = await iot.createThing({ thingName: request.thingName }).promise()
        } catch (e) {
            getLogger().error('Failed to create Thing: %s: %O', request.thingName, e)
            throw e
        }

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
        const iot = await this.createIot()

        try {
            await iot.deleteThing({ thingName: request.thingName }).promise()
        } catch (e) {
            getLogger().error('Failed to delete Thing: %O', e)
            throw e
        }

        getLogger().debug('DeleteThing successful')
    }

    /**
     * Lists all IoT certificates in account.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listCertificates(request: Iot.ListCertificatesRequest): Promise<Iot.ListCertificatesResponse> {
        getLogger().debug('ListCertificates called with request: %O', request)
        const iot = await this.createIot()

        let output: Iot.ListCertificatesResponse
        try {
            output = await iot
                .listCertificates({
                    pageSize: request.pageSize ?? DEFAULT_MAX_THINGS,
                    marker: request.marker,
                    ascendingOrder: request.ascendingOrder,
                })
                .promise()
        } catch (e) {
            getLogger().error('Failed to retrieve certificates: %O', e)
            throw e
        }

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
        const iot = await this.createIot()

        let output: Iot.ListThingPrincipalsResponse
        try {
            output = await iot
                .listThingPrincipals({
                    thingName: request.thingName,
                    maxResults: request.maxResults ?? DEFAULT_MAX_THINGS,
                    nextToken: request.nextToken,
                })
                .promise()
        } catch (e) {
            getLogger().error('Failed to list thing principals: %O', e)
            throw e
        }
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
        const iot = await this.createIot()

        let output: Iot.DescribeCertificateResponse
        try {
            output = await iot.describeCertificate(request).promise()
        } catch (e) {
            getLogger().error('Failed to describe certificate: %O', e)
            throw e
        }
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

        const describedCerts = iotPrincipals.map(async iotPrincipal => {
            const certIdFound = iotPrincipal.match(CERT_ARN_PATTERN)
            if (!certIdFound) {
                return undefined
            }
            const certId = certIdFound[1]
            return this.describeCertificate({ certificateId: certId })
        })

        const resolvedCerts = (await Promise.all(describedCerts))
            .filter(cert => cert?.certificateDescription != undefined)
            .map(cert => cert?.certificateDescription as Iot.CertificateDescription)

        const response: ListThingCertificatesResponse = { certificates: resolvedCerts, nextToken: nextToken }
        getLogger().debug('ListThingCertificates returned response: %O', response)
        return { certificates: resolvedCerts, nextToken: nextToken }
    }

    /**
     * Lists Things attached to specified certificate.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listThingsForCert(request: Iot.ListPrincipalThingsRequest): Promise<string[]> {
        getLogger().debug('ListThingsForCert called with request: %O', request)
        const iot = await this.createIot()

        let iotThings: Iot.ThingName[]
        try {
            const output = await iot
                .listPrincipalThings({
                    maxResults: request.maxResults ?? DEFAULT_MAX_THINGS,
                    nextToken: request.nextToken,
                    principal: request.principal,
                })
                .promise()
            iotThings = output.things ?? []
        } catch (e) {
            getLogger().error('Failed to list things: %O', e)
            throw e
        }

        getLogger().debug('ListThingsForCert returned response: %O', iotThings)
        return iotThings
    }

    /**
     * Creates an X.509 certificate with a 2048 bit RSA keypair and saves them
     * to the filesystem.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async createCertificateAndKeys(
        request: Iot.CreateKeysAndCertificateRequest
    ): Promise<Iot.CreateKeysAndCertificateResponse> {
        getLogger().debug('CreateCertificate called with request: %O', request)
        const iot = await this.createIot()

        let output: Iot.CreateKeysAndCertificateResponse
        try {
            output = await iot.createKeysAndCertificate(request).promise()
        } catch (e) {
            getLogger().error('Failed to create certificate and keys: %O', e)
            throw e
        }

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
        const iot = await this.createIot()

        try {
            await iot
                .updateCertificate({ certificateId: request.certificateId, newStatus: request.newStatus })
                .promise()
        } catch (e) {
            getLogger().error('Failed to update certificate: %O', e)
            throw e
        }

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
        const iot = await this.createIot()

        try {
            await iot
                .deleteCertificate({ certificateId: request.certificateId, forceDelete: request.forceDelete })
                .promise()
        } catch (e) {
            getLogger().error('Failed to delete certificate: %O', e)
            throw e
        }

        getLogger().debug('DeleteCertificate successful')
    }

    /**
     * Attaches the certificate specified by the principal to the specified Thing.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async attachThingPrincipal(request: Iot.AttachThingPrincipalRequest): Promise<void> {
        getLogger().debug('AttachThingPrincipal called with request: %O', request)
        const iot = await this.createIot()

        try {
            await iot.attachThingPrincipal({ thingName: request.thingName, principal: request.principal }).promise()
        } catch (e) {
            getLogger().error('Failed to attach certificate: %O', e)
            throw e
        }

        getLogger().debug('AttachThingPrincipal successful')
    }

    /**
     * Detaches the certificate specified by the principal from the specified Thing.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async detachThingPrincipal(request: Iot.DetachThingPrincipalRequest): Promise<void> {
        getLogger().debug('DetachThingPrincipal called with request: %O', request)
        const iot = await this.createIot()

        try {
            await iot.detachThingPrincipal({ thingName: request.thingName, principal: request.principal }).promise()
        } catch (e) {
            getLogger().error('Failed to detach certificate: %O', e)
            throw e
        }

        getLogger().debug('DetachThingPrincipal successful')
    }

    /**
     * Lists all IoT Policies.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listPolicies(request: Iot.ListPoliciesRequest): Promise<Iot.ListPoliciesResponse> {
        getLogger().debug('ListPolicies called with request: %O', request)
        const iot = await this.createIot()

        let output: Iot.ListPoliciesResponse
        try {
            output = await iot
                .listPolicies({
                    pageSize: request.pageSize ?? DEFAULT_MAX_THINGS,
                    marker: request.marker,
                    ascendingOrder: request.ascendingOrder,
                })
                .promise()
        } catch (e) {
            getLogger().error('Failed to retrieve policies: %O', e)
            throw e
        }
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
        const iot = await this.createIot()

        let output: Iot.ListPrincipalPoliciesResponse
        try {
            output = await iot
                .listPrincipalPolicies({
                    principal: request.principal,
                    pageSize: request.pageSize ?? DEFAULT_MAX_THINGS,
                    marker: request.marker,
                    ascendingOrder: request.ascendingOrder,
                })
                .promise()
        } catch (e) {
            getLogger().error('Failed to retrieve policies: %O', e)
            throw e
        }
        getLogger().debug('ListPrincipalPolicies returned response: %O', output)
        return output
    }

    /**
     * Lists certificates attached to specified policy.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listPolicyTargets(request: Iot.ListTargetsForPolicyRequest): Promise<string[]> {
        getLogger().debug('ListPolicyTargets called with request: %O', request)
        const iot = await this.createIot()

        let arns: Iot.Target[]
        try {
            const output = await iot
                .listTargetsForPolicy({
                    pageSize: request.pageSize ?? DEFAULT_MAX_THINGS,
                    marker: request.marker,
                    policyName: request.policyName,
                })
                .promise()
            arns = output.targets ?? []
        } catch (e) {
            getLogger().error('Failed to list policy targets: %O', e)
            throw e
        }

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
        const iot = await this.createIot()

        try {
            await iot.attachPolicy({ policyName: request.policyName, target: request.target }).promise()
        } catch (e) {
            getLogger().error('Failed to attach policy: %O', e)
            throw e
        }

        getLogger().debug('AttachPolicy successful')
    }

    /**
     * Detaches the specified policy to the specified target certificate.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async detachPolicy(request: Iot.DetachPolicyRequest): Promise<void> {
        getLogger().debug('DetachPolicy called with request: %O', request)
        const iot = await this.createIot()

        try {
            await iot.detachPolicy({ policyName: request.policyName, target: request.target }).promise()
        } catch (e) {
            getLogger().error('Failed to detach policy: %O', e)
            throw e
        }

        getLogger().debug('DetachPolicy successful')
    }

    /**
     * Creates an policy from the given policy document.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async createPolicy(request: Iot.CreatePolicyRequest): Promise<void> {
        getLogger().debug('CreatePolicy called with request: %O', request)
        const iot = await this.createIot()

        let policyArn: string | undefined
        try {
            const output = await iot.createPolicy(request).promise()
            policyArn = output.policyArn
        } catch (e) {
            getLogger().error('Failed to create policy: %O', e)
            throw e
        }
        getLogger().info(`Created policy: ${policyArn}`)

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
        const iot = await this.createIot()

        try {
            await iot.deletePolicy({ policyName: request.policyName }).promise()
        } catch (e) {
            getLogger().error('Failed to delete Policy: %O', e)
            throw e
        }

        getLogger().debug('DeletePolicy successful')
    }

    /**
     * Retrieves the account's IoT device data endpoint.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async getEndpoint(): Promise<string> {
        getLogger().debug('GetEndpoint called')
        const iot = await this.createIot()

        let endpoint: string | undefined
        try {
            const output = await iot.describeEndpoint({ endpointType: IOT_ENDPOINT_TYPE }).promise()
            endpoint = output.endpointAddress
        } catch (e) {
            getLogger().error('Failed to retrieve endpoint: %O', e)
            throw e
        }
        if (!endpoint) {
            throw new Error('Failed to retrieve endpoint')
        }

        getLogger().debug('GetEndpoint successful')
        return endpoint
    }

    /**
     * Lists versions for an IoT Policy
     *
     * @throws Error if there is an error calling IoT.
     */
    public async *listPolicyVersions(request: Iot.ListPolicyVersionsRequest): AsyncIterableIterator<Iot.PolicyVersion> {
        const iot = await this.createIot()

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
        const iot = await this.createIot()

        try {
            await iot.createPolicyVersion(request).promise()
        } catch (e) {
            getLogger().error('Failed to create new Policy Version: %O', e)
            throw e
        }

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
        const iot = await this.createIot()

        try {
            await iot.deletePolicyVersion(request).promise()
        } catch (e) {
            getLogger().error('Failed to delete Policy Version: %O', e)
            throw e
        }

        getLogger().debug('DeletePolicyVersion successful')
    }

    /**
     * Sets a default version for an Iot Policy.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async setDefaultPolicyVersion(request: Iot.SetDefaultPolicyVersionRequest): Promise<void> {
        getLogger().debug('SetDefaultPolicyVersion called with request: %O', request)
        const iot = await this.createIot()

        try {
            await iot.setDefaultPolicyVersion(request).promise()
        } catch (e) {
            getLogger().error('Failed to set default policy version: %O', e)
            throw e
        }

        getLogger().debug('SetDefaultPolicyVersion successful')
    }

    /**
     * Downloads information including document for a specified policy version.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async getPolicyVersion(request: Iot.GetPolicyVersionRequest): Promise<Iot.GetPolicyVersionResponse> {
        getLogger().debug('GetPolicyVersion called with request: %O', request)
        const iot = await this.createIot()

        let output: Iot.GetPolicyVersionResponse
        try {
            output = await iot.getPolicyVersion(request).promise()
        } catch (e) {
            getLogger().error('Failed to get policy version: %O', e)
            throw e
        }

        getLogger().debug('GetPolicyVersion successful')
        return output
    }
}

export class DefaultIotThing {
    public readonly name: string
    public readonly arn: string

    public constructor({ name, arn }: { name: string; arn: string }) {
        this.name = name
        this.arn = arn
    }
}

export class DefaultIotCertificate {
    public readonly id: string
    public readonly arn: string
    public readonly activeStatus: string
    public readonly creationDate: Date

    public constructor({
        arn,
        id,
        activeStatus,
        creationDate,
    }: {
        arn: string
        id: string
        activeStatus: string
        creationDate: Date
    }) {
        this.id = id
        this.arn = arn
        this.activeStatus = activeStatus
        this.creationDate = creationDate
    }
}

export class DefaultIotPolicy {
    public readonly name: string
    public readonly arn: string

    public constructor({ name, arn }: { name: string; arn: string }) {
        this.name = name
        this.arn = arn
    }
}

async function createSdkClient(regionCode: string): Promise<Iot> {
    return await ext.sdkClientBuilder.createAwsService(Iot, undefined, regionCode)
}
