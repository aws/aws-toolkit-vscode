/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as jose from 'jose'
import * as crypto from 'crypto'
import { LanguageClientAuth } from '../auth/auth2'
import { AuthUtil } from '../codewhisperer/util/authUtil'

export async function createTestAuthUtil() {
    const encryptionKey = crypto.randomBytes(32)

    const jwe = await new jose.CompactEncrypt(new TextEncoder().encode(JSON.stringify({ your: 'mock data' })))
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .encrypt(encryptionKey)

    const fakeToken = {
        ssoToken: {
            id: 'fake-id',
            accessToken: jwe,
        },
        updateCredentialsParams: {
            data: 'fake-data',
        },
    }

    const mockLspAuth: Partial<LanguageClientAuth> = {
        registerSsoTokenChangedHandler: sinon.stub().resolves(),
        updateProfile: sinon.stub().resolves(),
        getSsoToken: sinon.stub().resolves(fakeToken),
        getProfile: sinon.stub().resolves({
            sso_registration_scopes: ['codewhisperer'],
        }),
        deleteBearerToken: sinon.stub().resolves(),
        updateBearerToken: sinon.stub().resolves(),
        invalidateSsoToken: sinon.stub().resolves(),
        encryptionKey,
    }

    AuthUtil.create(mockLspAuth as LanguageClientAuth)
}
