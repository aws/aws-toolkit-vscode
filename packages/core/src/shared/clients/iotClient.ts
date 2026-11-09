/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import {
    AttachPolicyCommand,
    AttachPolicyRequest,
    AttachThingPrincipalCommand,
    AttachThingPrincipalRequest,
    CertificateDescription,
    CreateKeysAndCertificateCommand,
    CreateKeysAndCertificateRequest,
    CreateKeysAndCertificateResponse,
    CreatePolicyCommand,
    CreatePolicyRequest,
    CreatePolicyResponse,
    CreatePolicyVersionCommand,
    CreatePolicyVersionRequest,
    CreateThingCommand,
    CreateThingRequest,
    CreateThingResponse,
    DeleteCertificateCommand,
    DeleteCertificateRequest,
    DeletePolicyCommand,
    DeletePolicyRequest,
    DeletePolicyVersionCommand,
    DeletePolicyVersionRequest,
    DeleteThingCommand,
    DeleteThingRequest,
    DescribeCertificateCommand,
    DescribeCertificateRequest,
    DescribeCertificateResponse,
    DescribeEndpointCommand,
    DetachPolicyCommand,
    DetachPolicyRequest,
    DetachThingPrincipalCommand,
    DetachThingPrincipalRequest,
    GetPolicyVersionCommand,
    GetPolicyVersionRequest,
    GetPolicyVersionResponse,
    IoTClient,
    ListCertificatesCommand,
    ListCertificatesRequest,
    ListCertificatesResponse,
    ListPoliciesCommand,
    ListPoliciesRequest,
    ListPoliciesResponse,
    ListPolicyVersionsCommand,
    ListPolicyVersionsRequest,
    ListPrincipalPoliciesCommand,
    ListPrincipalPoliciesRequest,
    ListPrincipalPoliciesResponse,
    ListPrincipalThingsCommand,
    ListPrincipalThingsRequest,
    ListTargetsForPolicyCommand,
    ListTargetsForPolicyRequest,
    ListThingPrincipalsCommand,
    ListThingPrincipalsRequest,
    ListThingPrincipalsResponse,
    ListThingsCommand,
    ListThingsRequest,
    ListThingsResponse,
    PolicyVersion,
    SetDefaultPolicyVersionCommand,
    SetDefaultPolicyVersionRequest,
    UpdateCertificateCommand,
    UpdateCertificateRequest,
} from '@aws-sdk/client-iot'
import { parse } from '@aws-sdk/util-arn-parser'
import { getLogger } from '../logger/logger'
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
    readonly certificates: CertificateDescription[]
    readonly nextToken: string | undefined
}

export class DefaultIotClient {
    public constructor(
        private readonly regionCode: string,
        private readonly iotProvider: (regionCode: string) => IoTClient = createSdkClient
    ) {}

    /**
     * Lists Things owned by the client.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listThings(request?: ListThingsRequest): Promise<ListThingsResponse> {
        getLogger().debug('ListThings called with request: %O', request)
        const iot = this.iotProvider(this.regionCode)

        const output: ListThingsResponse = await iot.send(
            new ListThingsCommand({
                maxResults: request?.maxResults ?? defaultMaxThings,
                nextToken: request?.nextToken,
            })
        )

        getLogger().debug('ListThings returned response: %O', output)
        return output
    }

    /**
     * Creates an IoT Thing.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async createThing(request: CreateThingRequest): Promise<CreateThingResponse> {
        getLogger().debug('CreateThing called with request: %O', request)
        const iot = this.iotProvider(this.regionCode)

        const output: CreateThingResponse = await iot.send(new CreateThingCommand({ thingName: request.thingName }))

        getLogger().debug('CreateThing returned response: %O', output)
        return output
    }

    /**
     * Deletes an IoT Thing.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async deleteThing(request: DeleteThingRequest): Promise<void> {
        getLogger().debug('DeleteThing called with request: %O', request)
        const iot = this.iotProvider(this.regionCode)

        await iot.send(new DeleteThingCommand({ thingName: request.thingName }))

        getLogger().debug('DeleteThing successful')
    }

    /**
     * Lists all IoT certificates in account.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listCertificates(request: ListCertificatesRequest): Promise<ListCertificatesResponse> {
        getLogger().debug('ListCertificates called with request: %O', request)
        const iot = this.iotProvider(this.regionCode)

        const output: ListCertificatesResponse = await iot.send(
            new ListCertificatesCommand({
                pageSize: request.pageSize ?? defaultMaxThings,
                marker: request.marker,
                ascendingOrder: request.ascendingOrder,
            })
        )

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
    public async listThingPrincipals(request: ListThingPrincipalsRequest): Promise<ListThingPrincipalsResponse> {
        const iot = this.iotProvider(this.regionCode)

        const output: ListThingPrincipalsResponse = await iot.send(
            new ListThingPrincipalsCommand({
                thingName: request.thingName,
                maxResults: request.maxResults ?? defaultMaxThings,
                nextToken: request.nextToken,
            })
        )
        return output
    }

    /**
     * Describes a certificate given the certificate ID.
     *
     * @throws Error if there is an error calling IoT.
     */
    private async describeCertificate(request: DescribeCertificateRequest): Promise<DescribeCertificateResponse> {
        const iot = this.iotProvider(this.regionCode)

        const output: DescribeCertificateResponse = await iot.send(new DescribeCertificateCommand(request))

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
    public async listThingCertificates(request: ListThingPrincipalsRequest): Promise<ListThingCertificatesResponse> {
        getLogger().debug('ListThingCertificates called with request: %O', request)

        const output = await this.listThingPrincipals(request)
        const iotPrincipals: string[] = output.principals ?? []
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
            .map((cert) => cert?.certificateDescription as CertificateDescription)

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
    public async listThingsForCert(request: ListPrincipalThingsRequest): Promise<string[]> {
        getLogger().debug('ListThingsForCert called with request: %O', request)
        const iot = this.iotProvider(this.regionCode)

        const output = await iot.send(
            new ListPrincipalThingsCommand({
                maxResults: request.maxResults ?? defaultMaxThings,
                nextToken: request.nextToken,
                principal: request.principal,
            })
        )
        const iotThings: string[] = output.things ?? []

        getLogger().debug('ListThingsForCert returned response: %O', iotThings)
        return iotThings
    }

    /**
     * Creates an X.509 certificate with a 2048 bit RSA keypair.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async createCertificateAndKeys(
        request: CreateKeysAndCertificateRequest
    ): Promise<CreateKeysAndCertificateResponse> {
        getLogger().debug('CreateCertificate called with request: %O', request)
        const iot = this.iotProvider(this.regionCode)

        const output: CreateKeysAndCertificateResponse = await iot.send(new CreateKeysAndCertificateCommand(request))

        getLogger().debug('CreateCertificate succeeded')
        return output
    }

    /**
     * Activates, deactivates, or revokes an IoT Certificate.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async updateCertificate(request: UpdateCertificateRequest): Promise<void> {
        getLogger().debug('UpdateCertificate called with request: %O', request)
        const iot = this.iotProvider(this.regionCode)

        await iot.send(
            new UpdateCertificateCommand({ certificateId: request.certificateId, newStatus: request.newStatus })
        )

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
    public async deleteCertificate(request: DeleteCertificateRequest): Promise<void> {
        getLogger().debug('DeleteCertificate called with request: %O', request)
        const iot = this.iotProvider(this.regionCode)

        await iot.send(new DeleteCertificateCommand(request))

        getLogger().debug('DeleteCertificate successful')
    }

    /**
     * Attaches the certificate specified by the principal to the specified Thing.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async attachThingPrincipal(request: AttachThingPrincipalRequest): Promise<void> {
        getLogger().debug('AttachThingPrincipal called with request: %O', request)
        const iot = this.iotProvider(this.regionCode)

        await iot.send(new AttachThingPrincipalCommand({ thingName: request.thingName, principal: request.principal }))

        getLogger().debug('AttachThingPrincipal successful')
    }

    /**
     * Detaches the certificate specified by the principal from the specified Thing.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async detachThingPrincipal(request: DetachThingPrincipalRequest): Promise<void> {
        getLogger().debug('DetachThingPrincipal called with request: %O', request)
        const iot = this.iotProvider(this.regionCode)

        await iot.send(new DetachThingPrincipalCommand({ thingName: request.thingName, principal: request.principal }))

        getLogger().debug('DetachThingPrincipal successful')
    }

    /**
     * Lists all IoT Policies.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listPolicies(request: ListPoliciesRequest): Promise<ListPoliciesResponse> {
        getLogger().debug('ListPolicies called with request: %O', request)
        const iot = this.iotProvider(this.regionCode)

        const output: ListPoliciesResponse = await iot.send(
            new ListPoliciesCommand({
                pageSize: request.pageSize ?? defaultMaxThings,
                marker: request.marker,
                ascendingOrder: request.ascendingOrder,
            })
        )

        getLogger().debug('ListPolicies returned response: %O', output)
        return output
    }

    /**
     * Lists IoT policies for principal.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listPrincipalPolicies(request: ListPrincipalPoliciesRequest): Promise<ListPoliciesResponse> {
        getLogger().debug('ListPrincipalPolicies called with request: %O', request)
        const iot = this.iotProvider(this.regionCode)

        const output: ListPrincipalPoliciesResponse = await iot.send(
            new ListPrincipalPoliciesCommand({
                principal: request.principal,
                pageSize: request.pageSize ?? defaultMaxThings,
                marker: request.marker,
                ascendingOrder: request.ascendingOrder,
            })
        )

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
    public async listPolicyTargets(request: ListTargetsForPolicyRequest): Promise<string[]> {
        getLogger().debug('ListPolicyTargets called with request: %O', request)
        const iot = this.iotProvider(this.regionCode)

        const output = await iot.send(
            new ListTargetsForPolicyCommand({
                pageSize: request.pageSize ?? defaultMaxThings,
                marker: request.marker,
                policyName: request.policyName,
            })
        )
        const arns: string[] = output.targets ?? []

        getLogger().debug('ListPolicyTargets returned response: %O', arns)
        return arns
    }

    /**
     * Attaches the specified policy to the specified target certificate.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async attachPolicy(request: AttachPolicyRequest): Promise<void> {
        getLogger().debug('AttachPolicy called with request: %O', request)
        const iot = this.iotProvider(this.regionCode)

        await iot.send(new AttachPolicyCommand({ policyName: request.policyName, target: request.target }))

        getLogger().debug('AttachPolicy successful')
    }

    /**
     * Detaches the specified policy to the specified target certificate.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async detachPolicy(request: DetachPolicyRequest): Promise<void> {
        getLogger().debug('DetachPolicy called with request: %O', request)
        const iot = this.iotProvider(this.regionCode)

        await iot.send(new DetachPolicyCommand({ policyName: request.policyName, target: request.target }))

        getLogger().debug('DetachPolicy successful')
    }

    /**
     * Creates an policy from the given policy document.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async createPolicy(request: CreatePolicyRequest): Promise<void> {
        getLogger().debug('CreatePolicy called with request: %O', request)
        const iot = this.iotProvider(this.regionCode)

        const output: CreatePolicyResponse = await iot.send(new CreatePolicyCommand(request))
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
    public async deletePolicy(request: DeletePolicyRequest): Promise<void> {
        getLogger().debug('DeletePolicy called with request: %O', request)
        const iot = this.iotProvider(this.regionCode)

        await iot.send(new DeletePolicyCommand({ policyName: request.policyName }))

        getLogger().debug('DeletePolicy successful')
    }

    /**
     * Retrieves the account's IoT device data endpoint.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async getEndpoint(): Promise<string> {
        getLogger().debug('GetEndpoint called')
        const iot = this.iotProvider(this.regionCode)

        const output = await iot.send(new DescribeEndpointCommand({ endpointType: iotEndpointType }))
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
    public async *listPolicyVersions(request: ListPolicyVersionsRequest): AsyncIterableIterator<PolicyVersion> {
        const iot = this.iotProvider(this.regionCode)

        const response = await iot.send(new ListPolicyVersionsCommand(request))

        if (response.policyVersions) {
            yield* response.policyVersions
        }
    }

    /**
     * Creates a new version for an IoT policy
     *
     * @throws Error if there is an error calling IoT.
     */
    public async createPolicyVersion(request: CreatePolicyVersionRequest): Promise<void> {
        getLogger().debug('CreatePolicyVersion called with request: %O', request)
        const iot = this.iotProvider(this.regionCode)

        const output = await iot.send(new CreatePolicyVersionCommand(request))
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
    public async deletePolicyVersion(request: DeletePolicyVersionRequest): Promise<void> {
        getLogger().debug('DeletePolicyVersion called with request: %O', request)
        const iot = this.iotProvider(this.regionCode)

        await iot.send(new DeletePolicyVersionCommand(request))

        getLogger().debug('DeletePolicyVersion successful')
    }

    /**
     * Sets a default version for an Iot Policy.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async setDefaultPolicyVersion(request: SetDefaultPolicyVersionRequest): Promise<void> {
        getLogger().debug('SetDefaultPolicyVersion called with request: %O', request)
        const iot = this.iotProvider(this.regionCode)

        await iot.send(new SetDefaultPolicyVersionCommand(request))

        getLogger().debug('SetDefaultPolicyVersion successful')
    }

    /**
     * Downloads information including document for a specified policy version.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async getPolicyVersion(request: GetPolicyVersionRequest): Promise<GetPolicyVersionResponse> {
        getLogger().debug('GetPolicyVersion called with request: %O', request)
        const iot = this.iotProvider(this.regionCode)

        const output: GetPolicyVersionResponse = await iot.send(new GetPolicyVersionCommand(request))

        getLogger().debug('GetPolicyVersion successful')
        return output
    }
}

function createSdkClient(regionCode: string): IoTClient {
    return globals.sdkClientBuilderV3.createAwsService({
        serviceClient: IoTClient,
        clientOptions: { region: regionCode },
    })
}
