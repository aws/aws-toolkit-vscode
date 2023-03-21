/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { Auth, getSsoProfileKey, ProfileStore, SsoProfile, codewhispererScopes, SsoConnection } from '../../../credentials/auth'
import { CredentialsProviderManager } from '../../../credentials/providers/credentialsProviderManager'
import { SsoToken } from '../../../credentials/sso/model'
import { SsoAccessTokenProvider } from '../../../credentials/sso/ssoAccessTokenProvider'
import { FakeMemento } from '../../fakeExtensionContext'
import { stub } from '../../utilities/stubber'
import { AuthUtil, isUpgradeableConnection } from '../../../codewhisperer/util/authUtil'
import { Commands } from '../../../shared/vscode/commands2'
import { builderIdStartUrl } from '../../../credentials/sso/model'
import { getTestWindow } from '../../shared/vscode/window'
import { SeverityLevel } from '../../shared/vscode/message'

const enterpriseSsoStartUrl = 'https://enterprise.awsapps.com/start'
const awsBuilderIdProfileId = 'https://view.awsapps.com/start?scopes=codecatalyst:read_write,codewhisperer:analysis,codewhisperer:completions'
const enterpriseSsoProfileId = 'https://enterprise.awsapps.com/start?scopes=codewhisperer:analysis,codewhisperer:completions'

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

describe('AuthUtil', async function () {
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

    beforeEach(async function () {
        //stub allows creation of new AuthUtil (will get command already declared err otherwise).
        sinon.stub(Commands, 'register') 
        store = new ProfileStore(new FakeMemento())
        auth = new Auth(store, getTestTokenProvider, new CredentialsProviderManager())
    })

    afterEach(async function () {
        tokenProviders.clear()
        sinon.restore()
    })

    it('if there is no valid AwsBuilderID conn, it will create one and use it', async function () {
        //TODO: remove stub and verify with auth.activeConnection after fix in PR#3220 is merged.
        const authSpy = sinon.stub(Auth.instance, 'useConnection')
    
        getTestWindow().onDidShowQuickPick(async picker => {
            await picker.untilReady()
            picker.acceptItem(picker.items[1])
        })

        const authUtil = new AuthUtil(auth)
        await authUtil.connectToAwsBuilderId()

        const conn = authSpy.args[0][0] as SsoConnection
        assert.ok(authSpy.called)
        assert.strictEqual(conn.type, 'sso')
        assert.strictEqual(conn.label, 'AWS Builder ID')
        assert.strictEqual(conn.id, awsBuilderIdProfileId)
    })

    it('if there is no valid enterprise SSO conn, will create and use one', async function () {
        //TODO: remove stub and verify with auth.activeConnection after fix in PR#3220 is merged.
        const authSpy = sinon.stub(Auth.instance, 'useConnection')

        getTestWindow().onDidShowQuickPick(async picker => {
            await picker.untilReady()
            picker.acceptItem(picker.items[1])
        })
        
        const authUtil = new AuthUtil(auth)
        await authUtil.connectToEnterpriseSso(enterpriseSsoStartUrl)
    
        const conn = authSpy.args[0][0] as SsoConnection
        assert.ok(authSpy.called)
        assert.strictEqual(conn.type, 'sso')
        assert.strictEqual(conn.label, 'IAM Identity Center (enterprise)')
        assert.strictEqual(conn.id, enterpriseSsoProfileId)
    })

    it('can correctly identify upgradeable and non-upgradable SSO connections', async function () {
        const ssoProfile = createSsoProfile()
        const awsBuilderIdProfile = createAwsBuilderIdProfile({ scopes: codewhispererScopes })
        const enterpriseSsoProfile = createEntSsoProfile({ scopes: codewhispererScopes })
        
        const builderIdConn = await auth.createConnection(awsBuilderIdProfile)
        const ssoConn = await auth.createConnection(ssoProfile)
        const entSsoConn = await auth.createConnection(enterpriseSsoProfile)
        
        assert.ok(isUpgradeableConnection(ssoConn))
        assert.ok(!isUpgradeableConnection(builderIdConn))
        assert.ok(!isUpgradeableConnection(entSsoConn))
    })

    it('should show reauthenticate prompt', async function () {
        getTestWindow().onDidShowMessage(m => {
            if (m.severity === SeverityLevel.Warning) {
                m.selectItem('Cancel')
            }
        })

        await AuthUtil.instance.showReauthenticatePrompt()

        const warningMessage = getTestWindow().shownMessages.filter(m => m.severity == SeverityLevel.Warning)
        assert.strictEqual(warningMessage.length, 1)
        assert.strictEqual(warningMessage[0].message, 'AWS Toolkit: Connection expired. Reauthenticate to continue.')
    })
})