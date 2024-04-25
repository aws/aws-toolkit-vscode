// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export type BrowserSetupData = {
    stage: Stage,
    regions: Region[],
    idcInfo: IdcInfo,
    cancellable: boolean,
    feature: string,
    existConnections: AwsBearerTokenConnection[]
}

// plugin interface [AwsBearerTokenConnection]
export interface AwsBearerTokenConnection {
    sessionName: string,
    startUrl: string,
    region: string,
    scopes: string[],
    id: string
}
export const SONO_URL = "https://view.awsapps.com/start"

export type Stage =
    'START' |
    'SSO_FORM' |
    'CONNECTED' |
    'AUTHENTICATING' |
    'AWS_PROFILE' |
    'REAUTH'

export type Feature = 'Q' | 'codecatalyst' | 'awsExplorer'

export interface Region {
    id: string,
    name: string,
    partitionId: string,
    category: string,
    displayName: string
}

export interface IdcInfo {
    startUrl: string,
    region: string,
}

export interface State {
    stage: Stage,
    ssoRegions: Region[],
    authorizationCode: string | undefined,
    lastLoginIdcInfo: IdcInfo,
    feature: Feature,
    cancellable: boolean,
    existingConnections: AwsBearerTokenConnection[]
}

export enum LoginIdentifier {
    NONE = 'none',
    BUILDER_ID = 'builderId',
    ENTERPRISE_SSO = 'idc',
    IAM_CREDENTIAL = 'iam',
    EXISTING_LOGINS = 'existing',
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

    constructor(readonly url: string, readonly region: string) {
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

export class ExistConnection implements LoginOption {
    id: LoginIdentifier = LoginIdentifier.EXISTING_LOGINS

    constructor(readonly pluginConnectionId: string) {}

    // this case only happens for bearer connection for now
    requiresBrowser(): boolean {
        return true
    }
}
