/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { SageMakerServiceException } from '@amzn/sagemaker-client'
import {
    getVSCodeErrorTitle,
    getVSCodeErrorText,
    ExceptionType,
    ErrorText,
} from '../../../../awsService/sagemaker/detached-server/errorPage'

function createException(name: string, message: string = 'test message'): SageMakerServiceException {
    const err = new Error(message) as any
    err.name = name
    err.$fault = 'client'
    err.$metadata = {}
    return err as SageMakerServiceException
}

describe('errorPage', function () {
    describe('getVSCodeErrorTitle', function () {
        it('returns correct title for AccessDeniedException', function () {
            const err = createException(ExceptionType.ACCESS_DENIED)
            assert.strictEqual(getVSCodeErrorTitle(err), ErrorText.StartSession[ExceptionType.ACCESS_DENIED].Title)
        })

        it('returns correct title for ThrottlingException', function () {
            const err = createException(ExceptionType.THROTTLING)
            assert.strictEqual(getVSCodeErrorTitle(err), ErrorText.StartSession[ExceptionType.THROTTLING].Title)
        })

        it('returns default title for unknown exception type', function () {
            const err = createException('SomeRandomException')
            assert.strictEqual(getVSCodeErrorTitle(err), ErrorText.StartSession[ExceptionType.DEFAULT].Title)
        })

        it('returns correct title for ExpiredTokenException', function () {
            const err = createException(ExceptionType.EXPIRED_TOKEN)
            assert.strictEqual(getVSCodeErrorTitle(err), ErrorText.StartSession[ExceptionType.EXPIRED_TOKEN].Title)
        })

        it('returns correct title for ResourceLimitExceeded', function () {
            const err = createException(ExceptionType.RESOURCE_LIMIT_EXCEEDED)
            assert.strictEqual(
                getVSCodeErrorTitle(err),
                ErrorText.StartSession[ExceptionType.RESOURCE_LIMIT_EXCEEDED].Title
            )
        })
    })

    describe('getVSCodeErrorText', function () {
        it('replaces {message} placeholder for AccessDeniedException', function () {
            const err = createException(ExceptionType.ACCESS_DENIED, 'User not authorized')
            const text = getVSCodeErrorText(err)
            assert.ok(text.includes('User not authorized'))
            assert.ok(!text.includes('{message}'))
        })

        it('replaces {message} placeholder for ValidationException', function () {
            const err = createException(ExceptionType.VALIDATION, 'Invalid parameter')
            const text = getVSCodeErrorText(err)
            assert.ok(text.includes('Invalid parameter'))
        })

        it('returns static text for ThrottlingException', function () {
            const err = createException(ExceptionType.THROTTLING)
            const text = getVSCodeErrorText(err)
            assert.strictEqual(text, ErrorText.StartSession[ExceptionType.THROTTLING].Text)
        })

        it('returns static text for InternalFailure', function () {
            const err = createException(ExceptionType.INTERNAL_FAILURE)
            const text = getVSCodeErrorText(err)
            assert.strictEqual(text, ErrorText.StartSession[ExceptionType.INTERNAL_FAILURE].Text)
        })

        it('returns static text for ResourceLimitExceeded', function () {
            const err = createException(ExceptionType.RESOURCE_LIMIT_EXCEEDED)
            const text = getVSCodeErrorText(err)
            assert.strictEqual(text, ErrorText.StartSession[ExceptionType.RESOURCE_LIMIT_EXCEEDED].Text)
        })

        it('returns default text with exception type for unknown errors', function () {
            const err = createException('BizarroException')
            const text = getVSCodeErrorText(err)
            assert.ok(text.includes('BizarroException'))
            assert.ok(!text.includes('{exceptionType}'))
        })

        it('returns standard ExpiredToken text when not SMUS', function () {
            const err = createException(ExceptionType.EXPIRED_TOKEN)
            const text = getVSCodeErrorText(err, false)
            assert.strictEqual(text, ErrorText.StartSession[ExceptionType.EXPIRED_TOKEN].Text)
        })

        it('returns SMUS SSO text for ExpiredToken in SMUS SSO context', function () {
            const err = createException(ExceptionType.EXPIRED_TOKEN)
            const text = getVSCodeErrorText(err, true, false)
            assert.strictEqual(text, ErrorText.StartSession[ExceptionType.EXPIRED_TOKEN].SmusSsoText)
        })

        it('returns SMUS IAM text for ExpiredToken in SMUS IAM context', function () {
            const err = createException(ExceptionType.EXPIRED_TOKEN)
            const text = getVSCodeErrorText(err, true, true)
            assert.strictEqual(text, ErrorText.StartSession[ExceptionType.EXPIRED_TOKEN].SmusIamText)
        })
    })
})
