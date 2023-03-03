/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { Auth, Connection, SsoConnection, getSsoProfileKey, ProfileStore, SsoProfile, codewhispererScopes } from '../../../credentials/auth'
import { CredentialsProviderManager } from '../../../credentials/providers/credentialsProviderManager'
import { SsoClient } from '../../../credentials/sso/clients'
import { SsoToken } from '../../../credentials/sso/model'
import { SsoAccessTokenProvider } from '../../../credentials/sso/ssoAccessTokenProvider'
import { FakeMemento } from '../../fakeExtensionContext'
import { stub } from '../../utilities/stubber'
import { AuthUtil, isUpgradeableConnection } from '../../../codewhisperer/util/authUtil'
import { Commands } from '../../../shared/vscode/commands2'
import { builderIdStartUrl } from '../../../credentials/sso/model'
import { getTestWindow } from '../../shared/vscode/window'

const enterpriseSsoStartUrl = 'https://enterprise.awsapps.com/start'

function createSsoProfile(props?: Partial<Omit<SsoProfile, 'type'>>): SsoProfile {
    return {
        type: 'sso',
        ssoRegion: 'us-east-1',
        startUrl: 'https://d-0123456789.awsapps.com/start',
        ...props,
    }
}

function createAwsBuilderIdProfile(props?: Partial<Omit<SsoProfile, 'type'>>): SsoProfile {
    return {
        type: 'sso',
        ssoRegion: 'us-east-1',
        startUrl: builderIdStartUrl,
        ...props,
    }
}

function createEntSsoProfile(props?: Partial<Omit<SsoProfile, 'type'>>): SsoProfile {
    return {
        type: 'sso',
        ssoRegion: 'us-east-1',
        startUrl: enterpriseSsoStartUrl,
        ...props,
    }
}

const tokenProviders = new Map<string, ReturnType<typeof createTestTokenProvider>>()

function createTestTokenProvider() {
    let token: SsoToken | undefined
    const provider = stub(SsoAccessTokenProvider)
    provider.getToken.callsFake(async () => token)
    provider.createToken.callsFake(
        async () => (token = { accessToken: '123', expiresAt: new Date(Date.now() + 1000000) })
    )
    provider.invalidate.callsFake(async () => (token = undefined))

    return provider
}

function getTestTokenProvider(...[profile]: ConstructorParameters<typeof SsoAccessTokenProvider>) {
    const key = getSsoProfileKey(profile)
    const cachedProvider = tokenProviders.get(key)
    if (cachedProvider !== undefined) {
        return cachedProvider
    }

    const provider = createTestTokenProvider()
    tokenProviders.set(key, provider)

    return provider
}

let auth: Auth
let store: ProfileStore
let builderIdConn: SsoConnection | undefined
let ssoConn: SsoConnection
let entSsoConn: SsoConnection
let mockConnListNoBuilder: Connection[]
let mockConnListNoEntSso: Connection[]
const ssoProfile = createSsoProfile()
const awsBuilderIdProfile = createAwsBuilderIdProfile({ scopes: codewhispererScopes })
const enterpriseSsoProfile = createEntSsoProfile({ scopes: codewhispererScopes })

async function createMockConnections(){
    store = new ProfileStore(new FakeMemento())
    auth = new Auth(store, getTestTokenProvider, new CredentialsProviderManager())
    builderIdConn = await auth.createConnection(awsBuilderIdProfile)
    ssoConn = await auth.createConnection(ssoProfile)
    entSsoConn = await auth.createConnection(enterpriseSsoProfile)
}

describe('AuthUtil', async function () {
   before(async function () {
       await createMockConnections()
   })

    beforeEach(async function () {
        sinon.stub(Commands, 'register') 
        store = new ProfileStore(new FakeMemento())
        auth = new Auth(store, getTestTokenProvider, new CredentialsProviderManager())
        
        sinon.replace(SsoClient, 'create', () => {
            const s = stub(SsoClient)
            s.logout.resolves()

            return s
        })
              
    })

    afterEach(async function () {
        sinon.restore()
    })

    //TODO
    //factory function to create connectionlists dynamically
    //stub secondaryAuth useNewConnection? vs auth instance use connection
    //remove auth and profile from beforeEach and see if it breaks
    //todo: figure out what sinon.replace in beforeEach does
    //add start url to params of create SSO profile
    //figure out where to declare all the vars
    //TODO add more intermittent asserts
    it('if there is no valid AwsBuilderID conn, it will create one and use it', async function () {
        mockConnListNoBuilder = [ssoConn]
        sinon.stub(Auth.instance, 'listConnections').resolves(mockConnListNoBuilder)
        sinon.stub(Auth.instance, 'createConnection').resolves(builderIdConn)
        const authSpy = sinon.stub(Auth.instance, 'useConnection')

        getTestWindow().onDidShowQuickPick(async picker => {
            await picker.untilReady()
            picker.acceptItem(picker.items[1])
        })

        await AuthUtil.instance.connectToAwsBuilderId()
    
        assert.ok(authSpy.called)
        assert.strictEqual(authSpy.args[0][0], builderIdConn)
    })

    it('if there is no valid enterprise SSO conn, will create and use one', async function () {
        mockConnListNoEntSso = [ssoConn]
        sinon.stub(Auth.instance, 'listConnections').resolves(mockConnListNoEntSso)
        sinon.stub(Auth.instance, 'createConnection').resolves(entSsoConn)
        const authSpy = sinon.stub(Auth.instance, 'useConnection')

        getTestWindow().onDidShowQuickPick(async picker => {
            await picker.untilReady()
            picker.acceptItem(picker.items[1])
        })
        
        await AuthUtil.instance.connectToEnterpriseSso(enterpriseSsoStartUrl)

        assert.ok(authSpy.called)
        assert.strictEqual(authSpy.args[0][0], entSsoConn)
    })

    it('can correctly identify upgradeable and non-upgradable SSO connections', async function () {
        assert.ok(isUpgradeableConnection(ssoConn))
        assert.ok(!isUpgradeableConnection(builderIdConn))
        assert.ok(!isUpgradeableConnection(entSsoConn))
    })
})

