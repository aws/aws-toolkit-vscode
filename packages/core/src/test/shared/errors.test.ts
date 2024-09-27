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
    getTelemetryReasonDesc,
    getTelemetryResult,
    isNetworkError,
    resolveErrorMessageToDisplay,
    scrubNames,
    AwsClientResponseError,
    ToolkitError,
    tryRun,
    UnknownError,
    getErrorId,
} from '../../shared/errors'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { UnauthorizedException } from '@aws-sdk/client-sso'
import { AWSError } from 'aws-sdk'
import { AccessDeniedException } from '@aws-sdk/client-sso-oidc'
import { OidcClient } from '../../auth/sso/clients'
import { SamCliError } from '../../shared/sam/cli/samCliInvokerUtils'
import { DiskCacheError } from '../../shared/utilities/cacheUtils'

class TestAwsError extends Error implements AWSError {
    constructor(
        readonly code: string,
        message: string,
        readonly time: Date
    ) {
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

function trySetCause(err: Error | undefined, cause: unknown) {
    if (err && !(err instanceof ToolkitError)) {
        ;(err as any).cause = cause
    }
}

/** Creates a deep "cause chain", to test that error handler correctly gets the most relevant error. */
export function fakeErrorChain(err1?: Error, err2?: Error, err3?: Error, err4?: Error) {
    try {
        if (err1) {
            throw err1
        } else {
            throw new Error('generic error 1')
        }
    } catch (e1) {
        try {
            const e = err2 ? err2 : new UnknownError(e1)
            trySetCause(e, e1)
            throw e
        } catch (e2) {
            try {
                // new Error('error 3')
                const e = err3 ? err3 : new SamCliError('sam error', { cause: e2 as Error })
                trySetCause(e, e2)
                throw e
            } catch (e3) {
                const e = err4
                    ? err4
                    : ToolkitError.chain(e3, 'ToolkitError message', {
                          documentationUri: vscode.Uri.parse('https://docs.aws.amazon.com/toolkit-for-vscode/'),
                      })
                trySetCause(e, e3)

                return e
            }
        }
    }
}

/** Sends a (broken) request to the AWS OIDC service, to get a "real" error response. */
export async function getAwsServiceError(): Promise<Error> {
    const oidc = OidcClient.create('us-east-1')
    return oidc
        .createToken({
            clientId: 'AWS IDE Extensions',
            clientSecret: 'xx',
            deviceCode: 'xx',
            grantType: 'urn:ietf:params:oauth:grant-type:device_code',
        })
        .catch((e) => e)
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
                    super('oopsies', { code: 'OopsieErrorCode' })
                }
            }

            const error = OopsieError.chain(new Error('oops'), 'uh oh!')
            assert.ok(error instanceof ToolkitError)
            assert.ok(error instanceof OopsieError)
            assert.strictEqual(error.cause, undefined)
            assert.strictEqual(error.message, 'oopsies')
            assert.strictEqual(error.code, 'OopsieErrorCode')
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

    describe(`${DiskCacheError.name}`, function () {
        it(`subclasses ${ToolkitError.named.name}()`, function () {
            const dce = new DiskCacheError('foo')
            assert.strictEqual(dce instanceof ToolkitError, true)
            assert.strictEqual(dce.code, 'DiskCacheError')
            assert.strictEqual(dce.name, 'DiskCacheError')
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
    const prioritiziedAwsErrors: TestAwsError[] = preferredErrors.map((name) => {
        return new TestAwsError(name, awsErrorMessage, errorTime)
    })

    // Sanity check specific errors are resolved as expected
    prioritiziedAwsErrors.forEach((error) => {
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
            formatError(
                fakeErrorChain(undefined, fakeAwsErrorAccessDenied(), new Error('err 3'), fakeAwsErrorUnauth())
            ),
            'unauthorized-name: unauthorized message [unauthorized-code] (requestId: be62f79a-e9cf-41cd-a755-e6920c56e4fb)'
        )
    })

    it('getErrorId', function () {
        let error = new Error()
        assert.deepStrictEqual(getErrorId(error), 'Error')

        error = new Error()
        error.name = 'MyError'
        assert.deepStrictEqual(getErrorId(error), 'MyError')

        error = new ToolkitError('', { code: 'MyCode' })
        assert.deepStrictEqual(getErrorId(error), 'MyCode')

        // `code` takes priority over `name`
        error = new ToolkitError('', { code: 'MyCode', name: 'MyError' })
        assert.deepStrictEqual(getErrorId(error), 'MyCode')
    })

    it('getErrorMsg()', function () {
        assert.deepStrictEqual(
            getErrorMsg(
                fakeErrorChain(undefined, fakeAwsErrorAccessDenied(), new Error('err 3'), fakeAwsErrorUnauth())
            ),
            'unauthorized message'
        )
        assert.deepStrictEqual(getErrorMsg(undefined), undefined)
        let awsErr = new TestAwsError('ValidationException', 'aws validation msg 1', new Date())
        assert.deepStrictEqual(getErrorMsg(awsErr), 'aws validation msg 1')
        ;(awsErr as any).error_description = ''
        assert.deepStrictEqual(getErrorMsg(awsErr), 'aws validation msg 1')
        ;(awsErr as any).error_description = {}
        assert.deepStrictEqual(getErrorMsg(awsErr), 'aws validation msg 1')
        ;(awsErr as any).error_description = 'aws error desc 1'
        assert.deepStrictEqual(getErrorMsg(awsErr), 'aws error desc 1')

        // Arg withCause=true
        let toolkitError = new ToolkitError('ToolkitError Message')
        assert.deepStrictEqual(getErrorMsg(toolkitError, true), 'ToolkitError Message')

        awsErr = new TestAwsError('ValidationException', 'aws validation msg 1', new Date())
        toolkitError = new ToolkitError('ToolkitError Message', { cause: awsErr })
        assert.deepStrictEqual(
            getErrorMsg(toolkitError, true),
            `ToolkitError Message | ValidationException: aws validation msg 1`
        )

        const nestedNestedToolkitError = new Error('C')
        nestedNestedToolkitError.name = 'NameC'
        const nestedToolkitError = new ToolkitError('B', { cause: nestedNestedToolkitError, code: 'CodeB' })
        toolkitError = new ToolkitError('A', { cause: nestedToolkitError, code: 'CodeA' })
        assert.deepStrictEqual(getErrorMsg(toolkitError, true), `CodeA: A | CodeB: B | NameC: C`)

        // Arg withCause=true excludes the generic 'Error' id
        const errorWithGenericName = new Error('A') // note this does not set a value for `name`, by default it is 'Error'
        assert.deepStrictEqual(getErrorMsg(errorWithGenericName, true), `A`)
        errorWithGenericName.name = 'NameA' // now we set a `name`
        assert.deepStrictEqual(getErrorMsg(errorWithGenericName, true), `NameA: A`)
    })

    it('getTelemetryReasonDesc()', () => {
        const err = new Error('Cause Message a/b/c/d.txt')
        const toolkitError = new ToolkitError('ToolkitError Message', { cause: err, code: 'CodeA' })
        assert.deepStrictEqual(
            getTelemetryReasonDesc(toolkitError),
            'CodeA: ToolkitError Message | Cause Message x/x/x/x.txt'
        )
    })

    function makeSyntaxErrorWithSdkClientError() {
        // The following error messages are not arbitrary, changing them can break functionality
        const syntaxError: Error = new SyntaxError(
            'Unexpected token \'<\', "<html><bod"... is not valid JSON Deserialization error: to see the raw response, inspect the hidden field {error}.$response on this object.'
        )
        // Under the hood of a SyntaxError may be a hidden field with the real reason for the failure
        ;(syntaxError as any)['$response'] = { reason: 'SDK Client unexpected error response: data response code: 500' }
        return syntaxError
    }

    it('isNetworkError()', function () {
        assert.deepStrictEqual(
            isNetworkError(new Error('Failed to establish a socket connection to proxies BLAH BLAH BLAH')),
            true,
            'Did not VS Code Proxy error as network error'
        )
        assert.deepStrictEqual(
            isNetworkError(new Error('I am NOT a network error')),
            false,
            'Incorrectly indicated as network error'
        )

        const awsClientResponseError = AwsClientResponseError.instanceIf(makeSyntaxErrorWithSdkClientError())
        assert.deepStrictEqual(
            isNetworkError(awsClientResponseError),
            true,
            'Did not indicate SyntaxError as network error'
        )

        const err = new Error('getaddrinfo ENOENT oidc.us-east-1.amazonaws.com')
        ;(err as any).code = 'ENOENT'
        assert.deepStrictEqual(isNetworkError(err), true, 'Did not indicate ENOENT error as network error')

        const ebusyErr = new Error('getaddrinfo EBUSY oidc.us-east-1.amazonaws.com')
        ;(ebusyErr as any).code = 'EBUSY'
        assert.deepStrictEqual(isNetworkError(ebusyErr), true, 'Did not indicate EBUSY error as network error')

        // Response code errors
        let reponseCodeErr = new Error()
        reponseCodeErr.name = '502'
        assert.deepStrictEqual(isNetworkError(reponseCodeErr), true, 'Did not indicate 502 error as network error')
        reponseCodeErr = new Error()
        reponseCodeErr.name = '200'
        assert.deepStrictEqual(
            isNetworkError(reponseCodeErr),
            false,
            'Incorrectly indicated 200 error as network error'
        )
    })

    describe('AwsClientResponseError', function () {
        it('handles the happy path cases', function () {
            const syntaxError = makeSyntaxErrorWithSdkClientError()

            assert.deepStrictEqual(
                AwsClientResponseError.tryExtractReasonFromSyntaxError(syntaxError),
                'SDK Client unexpected error response: data response code: 500'
            )
            const responseError = AwsClientResponseError.instanceIf(syntaxError)
            assert(!(responseError instanceof SyntaxError))
            assert(responseError instanceof Error)
            assert(responseError instanceof AwsClientResponseError)
            assert(responseError.message === 'SDK Client unexpected error response: data response code: 500')
        })

        it('gracefully handles a SyntaxError with missing fields', function () {
            let syntaxError = makeSyntaxErrorWithSdkClientError()

            // No message about a '$response' field existing
            syntaxError.message = 'This does not mention a "$response" field existing'
            assert(!(AwsClientResponseError.instanceIf(syntaxError) instanceof AwsClientResponseError))
            assert.equal(syntaxError, AwsClientResponseError.instanceIf(syntaxError))

            // No '$response' field in SyntaxError
            syntaxError = makeSyntaxErrorWithSdkClientError()
            delete (syntaxError as any)['$response']
            assertIsAwsClientResponseError(syntaxError, `No '$response' field in SyntaxError | ${syntaxError.message}`)
            syntaxError = makeSyntaxErrorWithSdkClientError()
            ;(syntaxError as any)['$response'] = undefined
            assertIsAwsClientResponseError(syntaxError, `No '$response' field in SyntaxError | ${syntaxError.message}`)

            // No 'reason' in '$response'
            syntaxError = makeSyntaxErrorWithSdkClientError()
            let response = (syntaxError as any)['$response']
            delete response['reason']
            assertIsAwsClientResponseError(
                syntaxError,
                `No 'reason' field in '$response' | ${JSON.stringify(response)} | ${syntaxError.message}`
            )
            syntaxError = makeSyntaxErrorWithSdkClientError()
            response = (syntaxError as any)['$response']
            response['reason'] = undefined
            assertIsAwsClientResponseError(
                syntaxError,
                `No 'reason' field in '$response' | ${JSON.stringify(response)} | ${syntaxError.message}`
            )

            function assertIsAwsClientResponseError(e: Error, expectedMessage: string) {
                assert.deepStrictEqual(AwsClientResponseError.tryExtractReasonFromSyntaxError(e), expectedMessage)
                assert(AwsClientResponseError.instanceIf(e) instanceof AwsClientResponseError)
            }
        })
    })

    it('scrubNames()', async function () {
        const fakeUser = 'jdoe123'
        assert.deepStrictEqual(scrubNames('', fakeUser), '')
        assert.deepStrictEqual(scrubNames('a ./ b', fakeUser), 'a ./ b')
        assert.deepStrictEqual(scrubNames('a ../ b', fakeUser), 'a ../ b')
        assert.deepStrictEqual(scrubNames('a /.. b', fakeUser), 'a /.. b')
        assert.deepStrictEqual(scrubNames('a //..// b', fakeUser), 'a //..// b')
        assert.deepStrictEqual(scrubNames('a / b', fakeUser), 'a / b')
        assert.deepStrictEqual(scrubNames('a ~/ b', fakeUser), 'a ~/ b')
        assert.deepStrictEqual(scrubNames('a //// b', fakeUser), 'a //// b')
        assert.deepStrictEqual(scrubNames('a .. b', fakeUser), 'a .. b')
        assert.deepStrictEqual(scrubNames('a . b', fakeUser), 'a . b')
        assert.deepStrictEqual(scrubNames('      lots      of         space       ', 'space'), 'lots of x')
        assert.deepStrictEqual(
            scrubNames(
                'Failed to save c:/fooß/aïböcß/aób∑c/∑ö/ππ¨p/ö/a/bar123öabc/baz.txt EACCES no permissions (error!)',
                fakeUser
            ),
            'Failed to save c:/xß/xï/xó/x∑/xπ/xö/x/xö/x.txt EACCES no permissions (error!)'
        )
        assert.deepStrictEqual(
            scrubNames('user: jdoe123 file: C:/Users/user1/.aws/sso/cache/abc123.json (regex: /foo/)', fakeUser),
            'user: x file: C:/Users/x/.aws/sso/cache/x.json (regex: /x/)'
        )
        assert.deepStrictEqual(scrubNames('/Users/user1/foo.jso', fakeUser), '/Users/x/x.jso')
        assert.deepStrictEqual(scrubNames('/Users/user1/foo.js', fakeUser), '/Users/x/x.js')
        assert.deepStrictEqual(scrubNames('/Users/user1/noFileExtension', fakeUser), '/Users/x/x')
        assert.deepStrictEqual(scrubNames('/Users/user1/minExtLength.a', fakeUser), '/Users/x/x.a')
        assert.deepStrictEqual(scrubNames('/Users/user1/extIsNum.123456', fakeUser), '/Users/x/x.123456')
        assert.deepStrictEqual(
            scrubNames('/Users/user1/foo.looooooooongextension', fakeUser),
            '/Users/x/x.looooooooongextension'
        )
        assert.deepStrictEqual(scrubNames('/Users/user1/multipleExts.ext1.ext2.ext3', fakeUser), '/Users/x/x.ext3')

        assert.deepStrictEqual(scrubNames('c:\\fooß\\bar\\baz.txt', fakeUser), 'c:/xß/x/x.txt')
        assert.deepStrictEqual(
            scrubNames('uhh c:\\path with\\ spaces \\baz.. hmm...', fakeUser),
            'uhh c:/x x/ spaces /x hmm...'
        )
        assert.deepStrictEqual(
            scrubNames('unc path: \\\\server$\\pipename\\etc END', fakeUser),
            'unc path: //x$/x/x END'
        )
        assert.deepStrictEqual(
            scrubNames('c:\\Users\\user1\\.aws\\sso\\cache\\abc123.json jdoe123 abc', fakeUser),
            'c:/Users/x/.aws/sso/cache/x.json x abc'
        )
        assert.deepStrictEqual(
            scrubNames('unix /home/jdoe123/.aws/config failed', fakeUser),
            'unix /home/x/.aws/config failed'
        )
        assert.deepStrictEqual(scrubNames('unix ~jdoe123/.aws/config failed', fakeUser), 'unix ~x/.aws/config failed')
        assert.deepStrictEqual(scrubNames('unix ../../.aws/config failed', fakeUser), 'unix ../../.aws/config failed')
        assert.deepStrictEqual(scrubNames('unix ~/.aws/config failed', fakeUser), 'unix ~/.aws/config failed')
    })
})

describe('errors.tryRun()', function () {
    it('swallows error from sync fn', function () {
        const err = new Error('err')
        tryRun(
            () => {
                throw err
            },
            () => false
        )
    })

    it('swallows error from async fn', async function () {
        const err = new Error('err')
        await tryRun(
            async () => {
                throw err
            },
            () => false
        )
    })

    it('throws error from sync fn', function () {
        const err = new Error('err')
        assert.throws(() => {
            tryRun(
                () => {
                    throw err
                },
                () => true
            )
        }, err)
    })

    it('throws error from async fn', async function () {
        const err = new Error('err')
        await assert.rejects(async () => {
            await tryRun(
                async () => {
                    throw err
                },
                () => true
            )
        }, err)
    })
})
