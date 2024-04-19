// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export type Stage = 'START' | 'SSO_FORM' | 'CONNECTED' | 'AUTHENTICATING' | 'AWS_PROFILE' | 'TOOLKIT_BEARER'

export type Feature = 'Q' | 'codecatalyst' | 'awsExplorer'

export interface Region {
    id: string,
    name: string,
    partitionId: string,
    category: string,
    displayName: string
}

export interface IdcInfo {
    profileName: string,
    startUrl: string,
    region: string,
}

export interface State {
    stage: Stage,
    ssoRegions: Region[],
    authorizationCode: string | undefined,
    lastLoginIdcInfo: IdcInfo,
    feature: Feature,
    cancellable: boolean
}

export enum LoginIdentifier {
    NONE,
    BUILDER_ID,
    ENTERPRISE_SSO,
    IAM_CREDENTIAL,
    EXISTING_LOGINS,
}

export interface LoginOption {
    id: LoginIdentifier
    requiresBrowser(): boolean
}

export class LongLivedIAM implements LoginOption {
    id: LoginIdentifier = LoginIdentifier.IAM_CREDENTIAL

    constructor(readonly profileName: string, readonly accessKey: string, readonly secret: string) {
    }

    requiresBrowser(): boolean {
        return false
    }
}

export class IdC implements LoginOption {
    id: LoginIdentifier = LoginIdentifier.ENTERPRISE_SSO

    constructor(readonly profileName: string, readonly url: string, readonly region: string) {
    }

    requiresBrowser(): boolean {
        return true
    }
}

export class BuilderId implements LoginOption {
    id: LoginIdentifier = LoginIdentifier.BUILDER_ID

    requiresBrowser(): boolean {
        return true
    }
}
