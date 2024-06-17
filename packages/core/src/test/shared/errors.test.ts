/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import vscode from 'vscode'
import {
    findBestErrorInChain,
    formatError,
    getErrorMsg,
    getTelemetryReason,
    getTelemetryResult,
    resolveErrorMessageToDisplay,
    ToolkitError,
} from '../../shared/errors'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { UnauthorizedException } from '@aws-sdk/client-sso'
import { AWSError } from 'aws-sdk'
import { AccessDeniedException } from '@aws-sdk/client-sso-oidc'

class TestAwsError extends Error implements AWSError {
    constructor(readonly code: string, message: string, readonly time: Date) {
        super(message)
    }
}

// Error containing `error_description`.
function fakeAwsErrorAccessDenied() {
    const e = new AccessDeniedException({
        error: 'access_denied',
        message: 'accessdenied message',
        $metadata: {
            attempts: 3,
            requestId: 'or62s79n-r9ps-41pq-n755-r6920p56r4so',
            totalRetryDelay: 3000,
            httpStatusCode: 403,
        },
    }) as any
    e.name = 'accessdenied-name'
    e.code = 'accessdenied-code'
    e.error_description = 'access_denied error_description'
    e.time = new Date()
    return e as AccessDeniedException
}

// Error NOT containing `error_description`.
function fakeAwsErrorUnauth() {
    const e = new UnauthorizedException({
        message: 'unauthorized message',
        $metadata: {
            attempts: 3,
            requestId: 'be62f79a-e9cf-41cd-a755-e6920c56e4fb',
            totalRetryDelay: 3000,
            httpStatusCode: 403,
        },
    }) as any
    e.name = 'unauthorized-name'
    e.code = 'unauthorized-code'
    e.time = new Date()
    return e as UnauthorizedException
}

function fakeErrorChain() {
    try {
        throw new Error('generic error 1')
    } catch (e1) {
        try {
            const e = fakeAwsErrorAccessDenied()
            ;(e as any).cause = e1
            throw e
        } catch (e2) {
            try {
                throw ToolkitError.chain(e2, 'ToolkitError message', {
                    documentationUri: vscode.Uri.parse(
                        'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/welcome.html'
                    ),
                })
            } catch (e3) {
                const e = fakeAwsErrorUnauth()
                ;(e as any).cause = e3
                return e
            }
        }
    }
}

describe('ToolkitError', function () {
    it('can store an error message', function () {
        const error = new ToolkitError('uh oh!')
        assert.strictEqual(error.message, 'uh oh!')
    })

    it('can store an error name', function () {
        const error = new ToolkitError('uh oh!', { name: 'MyError' })
        assert.strictEqual(error.name, 'MyError')
    })

    it('can store an error code', function () {
        const error = new ToolkitError('uh oh!', { code: 'BrokeStuff' })
        assert.strictEqual(error.code, 'BrokeStuff')
    })

    it('can store detailed information', function () {
        const error = new ToolkitError('uh oh!', { details: { why: 'something broke' } })
        assert.strictEqual(error.details?.why, 'something broke')
    })

    it('can chain errors together', function () {
        const error1 = new Error()
        const error2 = new ToolkitError('uh oh!', { cause: error1 })
        assert.strictEqual(error2.cause, error1)
    })

    describe('immutability', function () {
        it('throws if trying to assign to `cause` after instantiation', function () {
            const error = new ToolkitError('uh oh!')
            assert.throws(() => Object.assign(error, { cause: new Error() }))
        })

        it('does not use the indirect `cause` reference passed in during construction', function () {
            const info = { cause: new Error() }
            const error = new ToolkitError('uh oh!', info)
            assert.strictEqual(error.cause, info.cause)

            info.cause = new Error()
            assert.notStrictEqual(error.cause, info.cause)
        })
    })

    describe('cancels', function () {
        it('treats `user` cancellations as cancelled', function () {
            const error = new ToolkitError('', { cause: new CancellationError('user') })
            assert.strictEqual(error.cancelled, true)
        })

        it('does not treat `timeout` cancellations as cancelled', function () {
            const error = new ToolkitError('', { cause: new CancellationError('timeout') })
            assert.strictEqual(error.cancelled, false)
        })

        it('traverses the error chain to determine cancellation', function () {
            const error1 = new ToolkitError('', { cause: new CancellationError('user') })
            const error2 = new ToolkitError('', { cause: error1 })
            assert.strictEqual(error2.cancelled, true)
        })

        it('uses explicit `cancellation` flag if set to `true`', function () {
            const error = new ToolkitError('', {
                cancelled: true,
                cause: new CancellationError('timeout'),
            })
            assert.strictEqual(error.cancelled, true)
        })

        it('uses explicit `cancellation` flag if set to `false`', function () {
            const error = new ToolkitError('', {
                cancelled: false,
                cause: new CancellationError('user'),
            })
            assert.strictEqual(error.cancelled, false)
        })
    })

    describe('traces', function () {
        it('uses the error message + name', function () {
            const error = new ToolkitError('uh oh!', { name: 'MyError' })
            assert.strictEqual(error.trace, `MyError: uh oh!`)
        })

        it('formats error details and appends the result to the end of the message', function () {
            const error = new ToolkitError('oops', { details: { foo: 'Foo', bar: 'Bar' } })
            assert.strictEqual(error.trace, `Error: oops (foo: Foo; bar: Bar)`)
        })

        it('adds the error code if available', function () {
            const error = new ToolkitError('oops', { code: 'MyBad', details: { foo: 'Foo' } })
            assert.strictEqual(error.trace, `Error: oops [MyBad] (foo: Foo)`)
        })

        it('does not include the code when it is equal to the name', function () {
            const error = new ToolkitError('oops', { code: 'MyBad', name: 'MyBad' })
            assert.strictEqual(error.trace, `MyBad: oops`)
        })

        it('formats chains of errors', function () {
            const first = new ToolkitError('oops', { code: 'MyBad' })
            const second = ToolkitError.chain(first, 'uh oh!', { name: 'MyError' })
            const third = ToolkitError.chain(second, 'something broke')

            assert.strictEqual(third.trace, `Error: something broke\n\t -> MyError: uh oh!\n\t -> Error: oops [MyBad]`)
        })

        it('includes extra information for AWS errors', function () {
            const original = Object.assign(new Error('Access Denied'), {
                statusCode: 403,
                time: new Date(),
                name: 'AccessDeniedException',
                code: 'AccessDeniedException',
            })

            const error = ToolkitError.chain(original, 'uh oh!')
            assert.strictEqual(
                error.trace,
                `Error: uh oh!\n\t -> AccessDeniedException: Access Denied (statusCode: 403)`
            )
        })
    })

    describe('named', function () {
        it('can be extended with a constant name', function () {
            const MyError = ToolkitError.named('MyError')
            assert.strictEqual(new MyError('uh oh!').name, 'MyError')
        })

        it('maintains the prototype chain with a constructor', function () {
            const OopsieError = class extends ToolkitError.named('OopsieError') {
                public constructor() {
                    super('oopsies')
                }
            }

            const error = OopsieError.chain(new Error('oops'), 'uh oh!')
            assert.ok(error instanceof ToolkitError)
            assert.ok(error instanceof OopsieError)
            assert.strictEqual(error.cause, undefined)
            assert.strictEqual(error.message, 'oopsies')
        })

        it('maintains the prototype chain without a constructor', function () {
            const MyError = ToolkitError.named('MyError')
            const MyOtherError = class extends MyError {
                public readonly fault = 'foo'
            }

            const error = MyOtherError.chain(new Error('oops'), 'uh oh!')
            assert.ok(error instanceof ToolkitError)
            assert.ok(error instanceof MyError)
            assert.ok(error instanceof MyOtherError)
            assert.strictEqual(error.name, 'MyError')
            assert.strictEqual(error.fault, 'foo')
            assert.strictEqual(error.cause?.message, 'oops')
        })
    })
})

describe('Telemetry', function () {
    describe('getTelemetryResult', function () {
        it('returns `Succeeded` if no error is given', function () {
            assert.strictEqual(getTelemetryResult(undefined), 'Succeeded')
        })

        it('returns `Cancelled` for user cancellation errors', function () {
            assert.strictEqual(getTelemetryResult(new CancellationError('user')), 'Cancelled')
        })

        it('returns `Cancelled` for a cancelled `ToolkitError`', function () {
            const error = ToolkitError.chain(new CancellationError('user'), '')
            assert.strictEqual(getTelemetryResult(error), 'Cancelled')
        })

        it('returns `Failed` for timeout errors', function () {
            assert.strictEqual(getTelemetryResult(new CancellationError('timeout')), 'Failed')
        })

        it('returns `Failed` for generic errors', function () {
            assert.strictEqual(getTelemetryResult(new Error()), 'Failed')
        })
    })

    describe('getTelemetryReason', function () {
        it('uses the error name if there is no error chain', function () {
            const error = new ToolkitError('', { name: 'MyError' })
            assert.strictEqual(getTelemetryReason(error), 'MyError')
        })

        it('uses the error `code` instead of the name', function () {
            const error = new ToolkitError('', { name: 'MyError', code: 'ErrorCode' })
            assert.strictEqual(getTelemetryReason(error), 'ErrorCode')
        })

        it('can handle AWS errors (JS SDK v2)', function () {
            const error = Object.assign(new Error(), { code: 'AccessDeniedException', time: new Date() })
            assert.strictEqual(getTelemetryReason(error), 'AccessDeniedException')
        })

        it('can handle AWS errors (JS SDK v3)', function () {
            const error = new UnauthorizedException({ message: '', $metadata: {} })
            assert.strictEqual(getTelemetryReason(error), 'UnauthorizedException')
        })

        it('traverses the error chain for the root cause', function () {
            const error1 = new ToolkitError('', { code: 'ErrorCode' })
            const error2 = new ToolkitError('', { cause: error1 })
            assert.strictEqual(getTelemetryReason(error2), 'ErrorCode')
        })
    })
})

describe('resolveErrorMessageToDisplay()', function () {
    const defaultMessage = 'My Default Message!'
    const normalErrorMessage = 'Normal error message'
    const toolkitErrorMessage = 'Toolkit error message'
    const awsErrorMessage = 'AWS error message'

    const errorTime: Date = new Date()
    const preferredErrors: string[] = [
        'ServiceQuotaExceededException',
        'ConflictException',
        'ValidationException',
        'ResourceNotFoundException',
    ]
    const prioritiziedAwsErrors: TestAwsError[] = preferredErrors.map(name => {
        return new TestAwsError(name, awsErrorMessage, errorTime)
    })

    // Sanity check specific errors are resolved as expected
    prioritiziedAwsErrors.forEach(error => {
        it(`resolves ${error.code} message when provided directly`, function () {
            const message = resolveErrorMessageToDisplay(error, defaultMessage)
            assert.strictEqual(message, `${defaultMessage}: ${awsErrorMessage}`)
        })
    })

    it('gets default message if no error is given', function () {
        const message = resolveErrorMessageToDisplay(undefined, defaultMessage)
        assert.strictEqual(message, defaultMessage)
    })

    it('gets default message if normal Error is given', function () {
        const message = resolveErrorMessageToDisplay(new Error(normalErrorMessage), defaultMessage)
        const expected = `${defaultMessage}: ${normalErrorMessage}`
        assert.strictEqual(message, expected)
    })

    it('gets ToolkitError if given', function () {
        const message = resolveErrorMessageToDisplay(new ToolkitError(toolkitErrorMessage), defaultMessage)
        assert.strictEqual(message, toolkitErrorMessage)
    })

    it('gets AWSError nested in a ToolkitError cause', function () {
        const awsError = prioritiziedAwsErrors[0]
        const toolkitError = new ToolkitError(toolkitErrorMessage, { cause: awsError })

        const message = resolveErrorMessageToDisplay(toolkitError, defaultMessage)

        assert.strictEqual(message, `${toolkitErrorMessage}: ${awsErrorMessage}`)
    })

    it('gets AWSError nested multiple levels in a ToolkitError cause', function () {
        const awsError = prioritiziedAwsErrors[0]
        const toolkitErrorTail = new ToolkitError(`${toolkitErrorMessage}-tail`, { cause: awsError })
        const toolkitErrorMiddle = new ToolkitError(`${toolkitErrorMessage}-middle`, { cause: toolkitErrorTail })
        const toolkitErrorHead = new ToolkitError(`${toolkitErrorMessage}-head`, { cause: toolkitErrorMiddle })

        const message = resolveErrorMessageToDisplay(toolkitErrorHead, defaultMessage)

        assert.strictEqual(message, `${toolkitErrorMessage}-head: ${awsErrorMessage}`)
    })

    it('gets first error if no preferred error in cause-chain', function () {
        const err1 = new Error(`${toolkitErrorMessage}-middle`)
        const err2 = new Error(`${toolkitErrorMessage}-head`)
        ;(err2 as any).cause = err1

        const expected = `${defaultMessage}: ${toolkitErrorMessage}-head`
        assert.strictEqual(resolveErrorMessageToDisplay(err2, defaultMessage), expected)
    })

    it('prefers AWSError matching preferredErrors', function () {
        const awsErr1 = new TestAwsError('ValidationException', 'validation msg', errorTime)
        const awsErr2 = new TestAwsError('NonPrioritizedAwsException', 'nonprioritized msg', errorTime)
        ;(awsErr2 as any).cause = awsErr1
        const err3 = new ToolkitError(toolkitErrorMessage, { cause: awsErr2 })

        const expected = `${toolkitErrorMessage}: validation msg`
        assert.strictEqual(resolveErrorMessageToDisplay(err3, defaultMessage), expected)
        ;(awsErr2 as any).cause = new Error('foo')
        assert.strictEqual(
            resolveErrorMessageToDisplay(err3, defaultMessage),
            `${toolkitErrorMessage}: nonprioritized msg`
        )
    })
})

describe('util', function () {
    it('findBestErrorInChain()', function () {
        // assert.deepStrictEqual(getErrorMsg(findBestErrorInChain(fakeErrorChain())), 'access_denied error_description')

        const err1 = new TestAwsError('ValidationException', 'aws validation msg 1', new Date())
        const err2 = new TestAwsError('ValidationException', 'aws validation msg 2', new Date())
        ;(err2 as any).cause = err1
        const err3 = new Error('err msg 3')
        ;(err3 as any).cause = err2
        assert.strictEqual(findBestErrorInChain(err3), err1)
        ;(err2 as any).error_description = 'aws error desc 2'
        assert.strictEqual(findBestErrorInChain(err3), err2)
    })

    it('formatError()', function () {
        assert.deepStrictEqual(
            formatError(fakeErrorChain()),
            'unauthorized-name: unauthorized message [unauthorized-code] (requestId: be62f79a-e9cf-41cd-a755-e6920c56e4fb)'
        )
    })

    it('getErrorMsg()', function () {
        assert.deepStrictEqual(getErrorMsg(fakeErrorChain()), 'unauthorized message')
        assert.deepStrictEqual(getErrorMsg(undefined), undefined)
        const err = new TestAwsError('ValidationException', 'aws validation msg 1', new Date())
        assert.deepStrictEqual(getErrorMsg(err), 'aws validation msg 1')
        ;(err as any).error_description = ''
        assert.deepStrictEqual(getErrorMsg(err), 'aws validation msg 1')
        ;(err as any).error_description = {}
        assert.deepStrictEqual(getErrorMsg(err), 'aws validation msg 1')
        ;(err as any).error_description = 'aws error desc 1'
        assert.deepStrictEqual(getErrorMsg(err), 'aws error desc 1')
    })
})
